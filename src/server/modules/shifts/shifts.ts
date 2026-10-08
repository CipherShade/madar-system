import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { AttendanceStatus, PaymentMethod, Role, ShiftStatus } from '../../../shared/constants/index.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { requireTenantWritable } from '../../lib/tenantLifecycle.js';
import { recordAuditEntry } from '../reports/audit.js';
import { isValidMoneyAmount, parsePagination } from '../../lib/http.js';

export type ShiftFinancialSummaryInput = {
  openingCash: number;
  cashCollected: number;
  vodafoneCashCollected: number;
  instapayCollected: number;
  teacherCashPayouts: number;
  cashExpenses: number;
};

export type ShiftFinancialSummary = {
  totalCashCollected: number;
  totalVodafoneCashCollected: number;
  totalInstapayCollected: number;
  totalGrossRevenue: number;
  totalTeacherCashPayouts: number;
  totalCashExpenses: number;
  expectedCashInDrawer: number;
};

type OpenShiftBody = {
  deskIdentifier: string;
  openingCash: number;
};

type CloseShiftBody = {
  actualCashCounted: number;
  closingNotes?: string | null;
};

type ExpenseBody = {
  category: string;
  amount: number;
  paymentMethod: PaymentMethod;
  description: string;
};

export function roundAmount(value: number): number {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
}

function moneyFailure() {
  return { success: false, error: { code: 'VALIDATION_ERROR', message: 'المبلغ المالي يجب أن يكون رقماً غير سالب بدقتين عشريتين على الأكثر.', messageEn: 'Monetary amounts must be a non-negative number with at most two decimal places.' } };
}

export function calculateCashVariance(actualCash: number, expectedCash: number): number {
  return roundAmount(actualCash - expectedCash);
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

/** The center a shift belongs to, or null when the token carries no tenant. */
function tenantRequired(request: { user?: { tenantId?: string | null } }): string | null {
  return request.user?.tenantId ?? null;
}

function tenantRequiredFailure() {
  return { success: false as const, error: { code: 'TENANT_REQUIRED', message: 'الحساب غير مرتبط بمركز تعليمي.', messageEn: 'Account has no tenant assigned.' } };
}

export function computeShiftFinancialSummary(input: ShiftFinancialSummaryInput): ShiftFinancialSummary {
  const totalCashCollected = roundAmount(input.cashCollected);
  const totalVodafoneCashCollected = roundAmount(input.vodafoneCashCollected);
  const totalInstapayCollected = roundAmount(input.instapayCollected);
  const totalTeacherCashPayouts = roundAmount(input.teacherCashPayouts);
  const totalCashExpenses = roundAmount(input.cashExpenses);
  const totalGrossRevenue = roundAmount(totalCashCollected + totalVodafoneCashCollected + totalInstapayCollected);
  const expectedCashInDrawer = roundAmount(input.openingCash + totalCashCollected - totalTeacherCashPayouts - totalCashExpenses);

  return {
    totalCashCollected,
    totalVodafoneCashCollected,
    totalInstapayCollected,
    totalGrossRevenue,
    totalTeacherCashPayouts,
    totalCashExpenses,
    expectedCashInDrawer,
  };
}

async function loadShiftFinancials(shiftId: string, tenantId: string, knownOpeningCash?: number) {
  const [attendanceGroups, teacherCashPayouts, cashExpenses, cashBookSales, openingCash] = await Promise.all([
    prisma.attendance.groupBy({
      by: ['paymentMethod'],
      where: { shiftRegisterId: shiftId, tenantId, status: { not: AttendanceStatus.VOID } },
      _sum: { amountPaid: true, changeOwed: true },
    }),
    prisma.sessionSettlement.aggregate({
      _sum: { teacherPayout: true },
      where: { disbursedFromShiftId: shiftId, tenantId, payoutMethod: PaymentMethod.CASH },
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { shiftRegisterId: shiftId, tenantId, paymentMethod: PaymentMethod.CASH },
    }),
    prisma.bookSale.aggregate({
      _sum: { total: true },
      where: { shiftRegisterId: shiftId, tenantId, paymentMethod: PaymentMethod.CASH },
    }),
    knownOpeningCash !== undefined
      ? null
      : prisma.shiftRegister.findFirst({
          where: { id: shiftId, tenantId },
          select: { openingCash: true },
        }),
  ]);

  const cashByMethod = (method: PaymentMethod) =>
    toNumber(attendanceGroups.find((g) => g.paymentMethod === method)?._sum.amountPaid ?? 0);
  const cashChangeOwed = toNumber(attendanceGroups.find((g) => g.paymentMethod === PaymentMethod.CASH)?._sum.changeOwed ?? 0);

  return computeShiftFinancialSummary({
    openingCash: knownOpeningCash !== undefined ? knownOpeningCash : toNumber(openingCash?.openingCash ?? 0),
    cashCollected: cashByMethod(PaymentMethod.CASH) - cashChangeOwed + toNumber(cashBookSales._sum.total ?? 0),
    vodafoneCashCollected: cashByMethod(PaymentMethod.VODAFONE_CASH),
    instapayCollected: cashByMethod(PaymentMethod.INSTAPAY),
    teacherCashPayouts: toNumber(teacherCashPayouts._sum.teacherPayout ?? 0),
    cashExpenses: toNumber(cashExpenses._sum.amount ?? 0),
  });
}

/**
 * Batches shift financial calculations for a paginated list of shifts.
 * Replaces 6*N database queries with 3 grouped database queries total.
 */
async function loadBatchShiftFinancials(
  shifts: Array<{ id: string; openingCash: Prisma.Decimal }>,
  tenantId: string,
): Promise<Map<string, ShiftFinancialSummary>> {
  if (shifts.length === 0) return new Map();
  const shiftIds = shifts.map((s) => s.id);

  const [attendancesGrouped, settlementsGrouped, expensesGrouped, cashBookSalesGrouped] = await Promise.all([
    prisma.attendance.groupBy({
      by: ['shiftRegisterId', 'paymentMethod'],
      where: { shiftRegisterId: { in: shiftIds }, tenantId, status: { not: AttendanceStatus.VOID } },
      _sum: { amountPaid: true, changeOwed: true },
    }),
    prisma.sessionSettlement.groupBy({
      by: ['disbursedFromShiftId'],
      where: { disbursedFromShiftId: { in: shiftIds }, tenantId, payoutMethod: PaymentMethod.CASH },
      _sum: { teacherPayout: true },
    }),
    prisma.expense.groupBy({
      by: ['shiftRegisterId'],
      where: { shiftRegisterId: { in: shiftIds }, tenantId, paymentMethod: PaymentMethod.CASH },
      _sum: { amount: true },
    }),
    prisma.bookSale.groupBy({
      by: ['shiftRegisterId'],
      where: { shiftRegisterId: { in: shiftIds }, tenantId, paymentMethod: PaymentMethod.CASH },
      _sum: { total: true },
    }),
  ]);

  const attendanceMap = new Map<string, Record<string, number>>();
  for (const row of attendancesGrouped) {
    let entry = attendanceMap.get(row.shiftRegisterId);
    if (!entry) {
      entry = {};
      attendanceMap.set(row.shiftRegisterId, entry);
    }
    entry[row.paymentMethod] = toNumber(row._sum.amountPaid);
    if (row.paymentMethod === PaymentMethod.CASH) {
      entry[row.paymentMethod] -= toNumber(row._sum.changeOwed);
    }
  }

  const settlementMap = new Map<string, number>();
  for (const row of settlementsGrouped) {
    if (row.disbursedFromShiftId) {
      settlementMap.set(row.disbursedFromShiftId, toNumber(row._sum.teacherPayout));
    }
  }

  const expenseMap = new Map<string, number>();
  for (const row of expensesGrouped) {
    if (row.shiftRegisterId) {
      expenseMap.set(row.shiftRegisterId, toNumber(row._sum.amount));
    }
  }

  const bookSaleMap = new Map<string, number>();
  for (const row of cashBookSalesGrouped) {
    if (row.shiftRegisterId) {
      bookSaleMap.set(row.shiftRegisterId, toNumber(row._sum.total));
    }
  }

  const result = new Map<string, ShiftFinancialSummary>();
  for (const shift of shifts) {
    const methods = attendanceMap.get(shift.id) ?? {};
    result.set(
      shift.id,
      computeShiftFinancialSummary({
        openingCash: toNumber(shift.openingCash),
        cashCollected: (methods[PaymentMethod.CASH] ?? 0) + (bookSaleMap.get(shift.id) ?? 0),
        vodafoneCashCollected: methods[PaymentMethod.VODAFONE_CASH] ?? 0,
        instapayCollected: methods[PaymentMethod.INSTAPAY] ?? 0,
        teacherCashPayouts: settlementMap.get(shift.id) ?? 0,
        cashExpenses: expenseMap.get(shift.id) ?? 0,
      }),
    );
  }

  return result;
}

function serializeShift(shift: { id: string; receptionistId: string; deskIdentifier: string; openedAt: Date; closedAt: Date | null; openingCash: Prisma.Decimal; actualCashCounted: Prisma.Decimal | null; expectedCash: Prisma.Decimal | null; cashVariance: Prisma.Decimal | null; status: ShiftStatus | string; closingNotes: string | null; }) {
  return {
    id: shift.id,
    receptionistId: shift.receptionistId,
    deskIdentifier: shift.deskIdentifier,
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
    openingCash: Number(shift.openingCash),
    actualCashCounted: shift.actualCashCounted ? Number(shift.actualCashCounted) : null,
    expectedCash: shift.expectedCash ? Number(shift.expectedCash) : null,
    cashVariance: shift.cashVariance ? Number(shift.cashVariance) : null,
    status: shift.status,
    closingNotes: shift.closingNotes,
  };
}

const shiftRoutes: FastifyPluginAsync = async (app) => {
  app.get('/current', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = tenantRequired(request);
    const shift = tenantId
      ? await prisma.shiftRegister.findFirst({
        where: { receptionistId: request.user.sub, tenantId, status: ShiftStatus.OPEN },
        orderBy: { openedAt: 'desc' },
      })
      : null;

    if (!shift) {
      return reply.send({ success: true, data: { shift: null } });
    }

    const financials = await loadShiftFinancials(shift.id, tenantId!, Number(shift.openingCash));
    return reply.send({
      success: true,
      data: {
        shift: {
          ...serializeShift(shift),
          financials,
        },
      },
    });
  });

  app.post<{ Body: OpenShiftBody }>('/open', {
    preHandler: [authenticate, requireRoles(Role.ADMIN, Role.RECEPTIONIST), requireTenantWritable],
    schema: {
      body: {
        type: 'object',
        required: ['deskIdentifier', 'openingCash'],
        additionalProperties: false,
        properties: {
          deskIdentifier: { type: 'string', minLength: 2, maxLength: 50 },
          openingCash: { type: 'number', minimum: 0, maximum: 1000000 },
        },
      },
    },
  }, async (request, reply) => {
    if (!isValidMoneyAmount(request.body.openingCash)) return reply.code(400).send(moneyFailure());
    const tenantId = tenantRequired(request);
    if (!tenantId) return reply.code(400).send(tenantRequiredFailure());
    const hasActiveShift = await prisma.shiftRegister.findFirst({
      where: { receptionistId: request.user.sub, tenantId, status: ShiftStatus.OPEN },
      select: { id: true },
    });

    if (hasActiveShift) {
      return reply.code(409).send({
        success: false,
        error: { code: 'SHIFT_ALREADY_OPEN', message: 'لديك وردية مفتوحة بالفعل، أغلقها أولاً.', messageEn: 'You already have an active shift open. Close it before opening a new one.' },
      });
    }

    const shift = await prisma.$transaction(async (transaction) => {
      const createdShift = await transaction.shiftRegister.create({
        data: {
          tenantId,
          receptionistId: request.user.sub,
          deskIdentifier: request.body.deskIdentifier.trim(),
          openingCash: new Prisma.Decimal(request.body.openingCash),
          status: ShiftStatus.OPEN,
        },
      });
      await recordAuditEntry({ actorId: request.user.sub, tenantId, shiftRegisterId: createdShift.id, action: 'SHIFT_OPENED', entityType: 'SHIFT_REGISTER', entityId: createdShift.id, amount: request.body.openingCash, metadata: { deskIdentifier: createdShift.deskIdentifier } }, transaction);
      return createdShift;
    });

    return reply.code(201).send({
      success: true,
      data: {
        shift: {
          ...serializeShift(shift),
          financials: computeShiftFinancialSummary({
            openingCash: Number(shift.openingCash),
            cashCollected: 0,
            vodafoneCashCollected: 0,
            instapayCollected: 0,
            teacherCashPayouts: 0,
            cashExpenses: 0,
          }),
        },
      },
    });
  });

  app.post<{ Body: CloseShiftBody }>('/close', {
    preHandler: [authenticate, requireRoles(Role.ADMIN, Role.RECEPTIONIST), requireTenantWritable],
    schema: {
      body: {
        type: 'object',
        required: ['actualCashCounted'],
        additionalProperties: false,
        properties: {
          actualCashCounted: { type: 'number', minimum: 0, maximum: 1000000 },
          closingNotes: { type: ['string', 'null'], maxLength: 2000 },
        },
      },
    },
  }, async (request, reply) => {
    const tenantId = tenantRequired(request);
    if (!tenantId) return reply.code(400).send(tenantRequiredFailure());
    const shift = await prisma.shiftRegister.findFirst({
      where: { receptionistId: request.user.sub, tenantId, status: ShiftStatus.OPEN },
      orderBy: { openedAt: 'desc' },
    });

    if (!shift) {
      return reply.code(400).send({
        success: false,
        error: { code: 'SHIFT_NOT_OPEN', message: 'لا توجد وردية مفتوحة لهذا المستخدم.', messageEn: 'There is no open shift for this receptionist.' },
      });
    }
    if (!isValidMoneyAmount(request.body.actualCashCounted)) return reply.code(400).send(moneyFailure());

    const financials = await loadShiftFinancials(shift.id, tenantId, Number(shift.openingCash));
    const actualCashCounted = roundAmount(request.body.actualCashCounted);
    const expectedCash = roundAmount(financials.expectedCashInDrawer);
    const cashVariance = calculateCashVariance(actualCashCounted, expectedCash);

    let closedShift: Awaited<ReturnType<typeof prisma.shiftRegister.findUniqueOrThrow>>;
    try {
      closedShift = await prisma.$transaction(async (transaction) => {
        const updatedShift = await transaction.shiftRegister.updateMany({
          where: { id: shift.id, tenantId, status: ShiftStatus.OPEN },
          data: {
            closedAt: new Date(),
            actualCashCounted: new Prisma.Decimal(actualCashCounted),
            expectedCash: new Prisma.Decimal(expectedCash),
            cashVariance: new Prisma.Decimal(cashVariance),
            status: ShiftStatus.CLOSED,
            closingNotes: request.body.closingNotes?.trim() || null,
          },
        });
        if (updatedShift.count !== 1) throw new Error('SHIFT_ALREADY_CLOSED');
        const result = await transaction.shiftRegister.findFirstOrThrow({ where: { id: shift.id, tenantId } });
        await recordAuditEntry({ actorId: request.user.sub, tenantId, shiftRegisterId: result.id, action: 'SHIFT_CLOSED', entityType: 'SHIFT_REGISTER', entityId: result.id, amount: actualCashCounted, metadata: { expectedCash, cashVariance, closingNotes: result.closingNotes } }, transaction);
        return result;
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'SHIFT_ALREADY_CLOSED') {
        return reply.code(409).send({
          success: false,
          error: { code: 'SHIFT_ALREADY_CLOSED', message: 'تم إغلاق الوردية بالفعل.', messageEn: 'The shift has already been closed.' },
        });
      }
      throw error;
    }

    return reply.send({
      success: true,
      data: {
        shift: {
          ...serializeShift(closedShift),
          totalVodafoneCash: financials.totalVodafoneCashCollected,
          totalInstapay: financials.totalInstapayCollected,
          financials,
        },
      },
    });
  });

  app.get<{ Querystring: { page?: string; limit?: string } }>('/history', { preHandler: [authenticate, requireRoles(Role.ADMIN, Role.RECEPTIONIST)] }, async (request, reply) => {
    const pagination = parsePagination(request.query);
    if (!pagination.ok) return reply.code(400).send(pagination.error);
    const tenantId = tenantRequired(request);
    if (!tenantId) {
      return reply.send({ success: true, data: { shifts: [], pagination: { page: pagination.page, limit: pagination.limit, total: 0, pages: 0 } } });
    }
    // An ADMIN sees every closed shift *in their own center* — opening cash,
    // counted cash and variance included. Without tenantId in this filter the
    // admin history was the entire platform's drawer balances.
    const where: Record<string, unknown> = request.user.role === Role.ADMIN
      ? { tenantId, status: ShiftStatus.CLOSED }
      : { tenantId, receptionistId: request.user.sub, status: ShiftStatus.CLOSED };
    const [shifts, total] = await Promise.all([
      prisma.shiftRegister.findMany({
        where,
        include: { receptionist: { select: { id: true, fullName: true } } },
        orderBy: { openedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.shiftRegister.count({ where }),
    ]);

    const financialsMap = await loadBatchShiftFinancials(shifts, tenantId);

    return reply.send({
      success: true,
      data: {
        shifts: shifts.map((shift) => ({
          ...serializeShift(shift),
          receptionist: shift.receptionist.fullName,
          financials: financialsMap.get(shift.id)!,
        })),
        pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) },
      },
    });
  });

  app.post<{ Body: ExpenseBody }>('/expenses', {
    preHandler: [authenticate, requireRoles(Role.ADMIN, Role.RECEPTIONIST), app.rateLimit.financial, requireTenantWritable],
    schema: {
      body: {
        type: 'object',
        required: ['category', 'amount', 'paymentMethod', 'description'],
        additionalProperties: false,
        properties: {
          category: { type: 'string', minLength: 1, maxLength: 50 },
          amount: { type: 'number', minimum: 0.01, maximum: 1000000 },
          paymentMethod: { type: 'string', enum: Object.values(PaymentMethod) },
          description: { type: 'string', minLength: 3, maxLength: 255 },
        },
      },
    },
  }, async (request, reply) => {
    if (!isValidMoneyAmount(request.body.amount)) return reply.code(400).send(moneyFailure());
    const tenantId = tenantRequired(request);
    if (!tenantId) return reply.code(400).send(tenantRequiredFailure());
    if (request.body.paymentMethod === PaymentMethod.CASH) {
      const openShift = await prisma.shiftRegister.findFirst({
        where: { receptionistId: request.user.sub, tenantId, status: ShiftStatus.OPEN },
        orderBy: { openedAt: 'desc' },
      });

      if (!openShift) {
        return reply.code(400).send({
          success: false,
          error: { code: 'SHIFT_NOT_OPEN', message: 'يجب فتح وردية نقدية قبل تسجيل مصروفات كاش.', messageEn: 'An active cash drawer shift is required before recording cash expenses.' },
        });
      }

      try {
        const expense = await prisma.$transaction(async (transaction) => {
          const currentShift = await transaction.shiftRegister.findFirst({ where: { id: openShift.id, tenantId }, select: { status: true } });
          if (!currentShift || currentShift.status !== ShiftStatus.OPEN) throw new Error('SHIFT_CLOSED');
          const createdExpense = await transaction.expense.create({
            data: {
              tenantId,
              category: request.body.category.trim(),
              amount: new Prisma.Decimal(request.body.amount),
              paymentMethod: PaymentMethod.CASH,
              description: request.body.description.trim(),
              createdById: request.user.sub,
              shiftRegisterId: openShift.id,
            },
          });
          await recordAuditEntry({ actorId: request.user.sub, tenantId, shiftRegisterId: openShift.id, action: 'EXPENSE_RECORDED', entityType: 'EXPENSE', entityId: createdExpense.id, amount: request.body.amount, metadata: { category: createdExpense.category, paymentMethod: createdExpense.paymentMethod } }, transaction);
          return createdExpense;
        });

        return reply.code(201).send({ success: true, data: { expense } });
      } catch (error) {
        if (error instanceof Error && error.message === 'SHIFT_CLOSED') {
          return reply.code(409).send({
            success: false,
            error: { code: 'SHIFT_CLOSED', message: 'تم إغلاق الوردية بالفعل، لا يمكن تسجيل المصروف.', messageEn: 'The shift was already closed and can no longer accept expenses.' },
          });
        }
        throw error;
      }
  }

  const expense = await prisma.$transaction(async (transaction) => {
    const createdExpense = await transaction.expense.create({
      data: {
        tenantId,
        category: request.body.category.trim(),
        amount: new Prisma.Decimal(request.body.amount),
        paymentMethod: request.body.paymentMethod,
        description: request.body.description.trim(),
        createdById: request.user.sub,
        shiftRegisterId: null,
      },
    });
    await recordAuditEntry({ actorId: request.user.sub, tenantId, shiftRegisterId: null, action: 'EXPENSE_RECORDED', entityType: 'EXPENSE', entityId: createdExpense.id, amount: request.body.amount, metadata: { category: createdExpense.category, paymentMethod: createdExpense.paymentMethod } }, transaction);
    return createdExpense;
  });

  return reply.code(201).send({ success: true, data: { expense } });
});
};

export default shiftRoutes;
