import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { PaymentMethod, Role, ShiftStatus } from '../../../shared/constants/index.js';
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

async function loadShiftFinancials(shiftId: string) {
  const [cashCollected, vodafoneCashCollected, instapayCollected, teacherCashPayouts, cashExpenses, openingCash] = await Promise.all([
    prisma.attendance.aggregate({
      _sum: { amountPaid: true },
      where: { shiftRegisterId: shiftId, paymentMethod: PaymentMethod.CASH },
    }),
    prisma.attendance.aggregate({
      _sum: { amountPaid: true },
      where: { shiftRegisterId: shiftId, paymentMethod: PaymentMethod.VODAFONE_CASH },
    }),
    prisma.attendance.aggregate({
      _sum: { amountPaid: true },
      where: { shiftRegisterId: shiftId, paymentMethod: PaymentMethod.INSTAPAY },
    }),
    prisma.sessionSettlement.aggregate({
      _sum: { teacherPayout: true },
      where: { disbursedFromShiftId: shiftId, payoutMethod: PaymentMethod.CASH },
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { shiftRegisterId: shiftId, paymentMethod: PaymentMethod.CASH },
    }),
    prisma.shiftRegister.findUnique({
      where: { id: shiftId },
      select: { openingCash: true },
    }),
  ]);

  return computeShiftFinancialSummary({
    openingCash: toNumber(openingCash?.openingCash ?? 0),
    cashCollected: toNumber(cashCollected._sum.amountPaid ?? 0),
    vodafoneCashCollected: toNumber(vodafoneCashCollected._sum.amountPaid ?? 0),
    instapayCollected: toNumber(instapayCollected._sum.amountPaid ?? 0),
    teacherCashPayouts: toNumber(teacherCashPayouts._sum.teacherPayout ?? 0),
    cashExpenses: toNumber(cashExpenses._sum.amount ?? 0),
  });
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
    const shift = await prisma.shiftRegister.findFirst({
      where: { receptionistId: request.user.sub, status: ShiftStatus.OPEN },
      orderBy: { openedAt: 'desc' },
    });

    if (!shift) {
      return reply.send({ success: true, data: { shift: null } });
    }

    const financials = await loadShiftFinancials(shift.id);
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
    const hasActiveShift = await prisma.shiftRegister.findFirst({
      where: { receptionistId: request.user.sub, status: ShiftStatus.OPEN },
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
          tenantId: request.user.tenantId || null,
          receptionistId: request.user.sub,
          deskIdentifier: request.body.deskIdentifier.trim(),
          openingCash: new Prisma.Decimal(request.body.openingCash),
          status: ShiftStatus.OPEN,
        },
      });
      await recordAuditEntry({ actorId: request.user.sub, shiftRegisterId: createdShift.id, action: 'SHIFT_OPENED', entityType: 'SHIFT_REGISTER', entityId: createdShift.id, amount: request.body.openingCash, metadata: { deskIdentifier: createdShift.deskIdentifier } }, transaction);
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
    const shift = await prisma.shiftRegister.findFirst({
      where: { receptionistId: request.user.sub, status: ShiftStatus.OPEN },
      orderBy: { openedAt: 'desc' },
    });

    if (!shift) {
      return reply.code(400).send({
        success: false,
        error: { code: 'SHIFT_NOT_OPEN', message: 'لا توجد وردية مفتوحة لهذا المستخدم.', messageEn: 'There is no open shift for this receptionist.' },
      });
    }
    if (!isValidMoneyAmount(request.body.actualCashCounted)) return reply.code(400).send(moneyFailure());

    const financials = await loadShiftFinancials(shift.id);
    const actualCashCounted = roundAmount(request.body.actualCashCounted);
    const expectedCash = roundAmount(financials.expectedCashInDrawer);
    const cashVariance = calculateCashVariance(actualCashCounted, expectedCash);

    let closedShift: Awaited<ReturnType<typeof prisma.shiftRegister.findUniqueOrThrow>>;
    try {
      closedShift = await prisma.$transaction(async (transaction) => {
        const updatedShift = await transaction.shiftRegister.updateMany({
          where: { id: shift.id, status: ShiftStatus.OPEN },
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
        const result = await transaction.shiftRegister.findUniqueOrThrow({ where: { id: shift.id } });
        await recordAuditEntry({ actorId: request.user.sub, shiftRegisterId: result.id, action: 'SHIFT_CLOSED', entityType: 'SHIFT_REGISTER', entityId: result.id, amount: actualCashCounted, metadata: { expectedCash, cashVariance, closingNotes: result.closingNotes } }, transaction);
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
    const where: Record<string, unknown> = request.user.role === Role.ADMIN ? { status: ShiftStatus.CLOSED } : { receptionistId: request.user.sub, status: ShiftStatus.CLOSED };
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
    return reply.send({
      success: true,
      data: {
        shifts: await Promise.all(shifts.map(async (shift) => ({ ...serializeShift(shift), receptionist: shift.receptionist.fullName, financials: await loadShiftFinancials(shift.id) }))),
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
    if (request.body.paymentMethod === PaymentMethod.CASH) {
      const openShift = await prisma.shiftRegister.findFirst({
        where: { receptionistId: request.user.sub, status: ShiftStatus.OPEN },
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
          const currentShift = await transaction.shiftRegister.findUnique({ where: { id: openShift.id }, select: { status: true } });
          if (!currentShift || currentShift.status !== ShiftStatus.OPEN) throw new Error('SHIFT_CLOSED');
          const createdExpense = await transaction.expense.create({
            data: {
              category: request.body.category.trim(),
              amount: new Prisma.Decimal(request.body.amount),
              paymentMethod: PaymentMethod.CASH,
              description: request.body.description.trim(),
              createdById: request.user.sub,
              shiftRegisterId: openShift.id,
            },
          });
          await recordAuditEntry({ actorId: request.user.sub, shiftRegisterId: openShift.id, action: 'EXPENSE_RECORDED', entityType: 'EXPENSE', entityId: createdExpense.id, amount: request.body.amount, metadata: { category: createdExpense.category, paymentMethod: createdExpense.paymentMethod } }, transaction);
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
        category: request.body.category.trim(),
        amount: new Prisma.Decimal(request.body.amount),
        paymentMethod: request.body.paymentMethod,
        description: request.body.description.trim(),
        createdById: request.user.sub,
        shiftRegisterId: null,
      },
    });
    await recordAuditEntry({ actorId: request.user.sub, shiftRegisterId: null, action: 'EXPENSE_RECORDED', entityType: 'EXPENSE', entityId: createdExpense.id, amount: request.body.amount, metadata: { category: createdExpense.category, paymentMethod: createdExpense.paymentMethod } }, transaction);
    return createdExpense;
  });

  return reply.code(201).send({ success: true, data: { expense } });
});
};

export default shiftRoutes;
