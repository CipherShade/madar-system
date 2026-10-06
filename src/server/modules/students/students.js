import { Prisma } from '@prisma/client';
import { Role, SchoolType } from '../../../shared/constants/index.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { requireTenantWritable } from '../../lib/tenantLifecycle.js';
import { normalizeArabicText } from '../../../shared/utils/arabicNormalization.js';
import { isValidUUID, parsePagination, uuidParamsSchema } from '../../lib/http.js';
import { EGYPTIAN_MOBILE_REGEX } from "../../../shared/constants/index.js";
const bodySchema = { type: 'object', required: ['fullName', 'guardianPhone', 'academicStage'], additionalProperties: false, properties: { fullName: { type: 'string', minLength: 2, maxLength: 150 }, studentPhone: { type: ['string', 'null'], pattern: '^(010|011|012|015)[0-9]{8}$' }, guardianPhone: { type: 'string', pattern: '^(010|011|012|015)[0-9]{8}$' }, academicStage: { type: 'string', minLength: 1, maxLength: 50 }, schoolType: { type: 'string', enum: Object.values(SchoolType) }, notes: { type: ['string', 'null'], maxLength: 2000 } } };
function invalid(message, messageEn, code = 'VALIDATION_ERROR') { return { success: false, error: { code, message, messageEn } }; }
export function validateStudentPhones(body) { if (!EGYPTIAN_MOBILE_REGEX.test(body.guardianPhone) || (body.studentPhone && !EGYPTIAN_MOBILE_REGEX.test(body.studentPhone)))
    return invalid('أرقام الهاتف يجب أن تكون أرقام محمول مصرية صحيحة.', 'Use valid Egyptian mobile numbers.'); return null; }
/** Pure search-where builder: Arabic-normalized name, phone, code, guardian phone. */
export function buildStudentSearchWhere(search) {
    const normalized = search ? normalizeArabicText(search) : '';
    if (!normalized)
        return {};
    return {
        OR: [
            { searchName: { contains: normalized } },
            { studentPhone: { contains: search } },
            { guardianPhone: { contains: search } },
            { studentCode: { contains: search } },
        ],
    };
}
/** Pure student-code sequence: STU-00001, STU-00002, ... from the latest code. */
export function nextStudentCodeFromLatest(latestCode) {
    const match = latestCode?.match(/(\d+)$/);
    return `STU-${String((match ? Number(match[1]) : 0) + 1).padStart(5, '0')}`;
}
async function nextStudentCode(tenantId) {
    const latest = await prisma.student.findFirst({
        where: { tenantId },
        orderBy: { studentCode: 'desc' },
        select: { studentCode: true },
    });
    return nextStudentCodeFromLatest(latest?.studentCode);
}
function serialize(student) { return student; }
export const serializeStudent = serialize;
const studentRoutes = async (app) => {
    app.get('/students', { preHandler: [authenticate, app.rateLimit.studentSearch] }, async (request, reply) => {
        const pagination = parsePagination(request.query);
        if (!pagination.ok)
            return reply.code(400).send(pagination.error);
        const { page, limit, skip } = pagination;
        const search = request.query.search?.trim();
        const searchWhere = buildStudentSearchWhere(search);
        const tenantId = request.user?.tenantId;
        // No tenant, no registry. Dropping the filter instead would return every
        // center's students — names, guardian phone numbers and stages.
        if (!tenantId) {
            return reply.send({ success: true, data: { students: [], pagination: { page, limit, total: 0, pages: 0 } } });
        }
        const where = { ...searchWhere, tenantId };
        const [students, total] = await Promise.all([prisma.student.findMany({ where, orderBy: { fullName: 'asc' }, skip, take: limit }), prisma.student.count({ where })]);
        return reply.send({ success: true, data: { students: students.map(serializeStudent), pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
    });
    app.post('/students', { preHandler: [authenticate, requireRoles(Role.ADMIN, Role.RECEPTIONIST), requireTenantWritable], schema: { body: bodySchema } }, async (request, reply) => {
        const body = request.body;
        const phoneError = validateStudentPhones(body);
        if (phoneError)
            return reply.code(400).send(phoneError);
        const fullName = body.fullName.trim();
        // Fail closed: an orphan student with a null tenant is invisible to every
        // tenant-scoped read, and its attendance could never be billed.
        const tenantId = request.user.tenantId;
        if (!tenantId)
            return reply.code(400).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_REQUIRED'));
        for (let attempt = 0;; attempt += 1) {
            try {
                const student = await prisma.student.create({
                    data: {
                        tenantId,
                        studentCode: await nextStudentCode(tenantId),
                        fullName,
                        searchName: normalizeArabicText(fullName),
                        studentPhone: body.studentPhone || null,
                        guardianPhone: body.guardianPhone,
                        academicStage: body.academicStage.trim(),
                        schoolType: body.schoolType ?? SchoolType.GENERAL,
                        notes: body.notes?.trim() || null,
                    },
                });
                return reply.code(201).send({ success: true, data: { student } });
            }
            catch (error) {
                if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                    if (attempt >= 2)
                        return reply.code(409).send(invalid('تعذر إنشاء كود طالب فريد، حاول مرة أخرى.', 'Could not create a unique student code.', 'STUDENT_CODE_CONFLICT'));
                    continue;
                }
                throw error;
            }
        }
    });
    app.patch('/students/:id', { preHandler: [authenticate, requireRoles(Role.ADMIN, Role.RECEPTIONIST), requireTenantWritable], schema: { params: uuidParamsSchema, body: { ...bodySchema, required: [] } } }, async (request, reply) => {
        if (!isValidUUID(request.params.id))
            return reply.code(400).send(invalid('معرّف الطالب غير صالح.', 'The student id is invalid.'));
        const tenantId = request.user.tenantId;
        if (!tenantId)
            return reply.code(400).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_REQUIRED'));
        const body = request.body;
        if (body.guardianPhone && !EGYPTIAN_MOBILE_REGEX.test(body.guardianPhone))
            return reply.code(400).send(invalid('رقم ولي الأمر غير صحيح.', 'Guardian phone is invalid.'));
        if (body.studentPhone && !EGYPTIAN_MOBILE_REGEX.test(body.studentPhone))
            return reply.code(400).send(invalid('رقم الطالب غير صحيح.', 'Student phone is invalid.'));
        try {
            const student = await prisma.student.update({ where: { id: request.params.id, tenantId }, data: { ...(body.fullName === undefined ? {} : { fullName: body.fullName.trim(), searchName: normalizeArabicText(body.fullName) }), ...(body.studentPhone === undefined ? {} : { studentPhone: body.studentPhone || null }), ...(body.guardianPhone === undefined ? {} : { guardianPhone: body.guardianPhone }), ...(body.academicStage === undefined ? {} : { academicStage: body.academicStage.trim() }), ...(body.schoolType === undefined ? {} : { schoolType: body.schoolType }), ...(body.notes === undefined ? {} : { notes: body.notes?.trim() || null }) } });
            return reply.send({ success: true, data: { student } });
        }
        catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
                return reply.code(404).send(invalid('الطالب غير موجود.', 'Student not found.', 'STUDENT_NOT_FOUND'));
            throw error;
        }
    });
    app.get('/students/:id/attendances', { preHandler: [authenticate, requireRoles(Role.ADMIN, Role.RECEPTIONIST)] }, async (request, reply) => {
        if (!isValidUUID(request.params.id))
            return reply.code(400).send(invalid('معرّف الطالب غير صالح.', 'The student id is invalid.'));
        const tenantId = request.user.tenantId;
        if (!tenantId)
            return reply.code(404).send(invalid('الطالب غير موجود.', 'Student not found.', 'STUDENT_NOT_FOUND'));
        const student = await prisma.student.findFirst({ where: { id: request.params.id, tenantId }, select: { id: true, fullName: true } });
        if (!student)
            return reply.code(404).send(invalid('الطالب غير موجود.', 'Student not found.', 'STUDENT_NOT_FOUND'));
        const attendances = await prisma.attendance.findMany({
            where: { studentId: request.params.id, tenantId, status: { not: 'VOID' } },
            include: {
                session: { select: { id: true, title: true, startTime: true, sessionPrice: true, status: true, teacher: { select: { fullName: true } } } },
                shiftRegister: { select: { deskIdentifier: true } },
            },
            orderBy: { checkInTime: 'desc' },
        });
        const summary = attendances.reduce((acc, attendance) => {
            const fee = Number(attendance.session.sessionPrice);
            const paid = Number(attendance.amountPaid);
            acc.totalPaid += paid;
            acc.totalOwed += Math.max(fee - paid, 0);
            return acc;
        }, { totalPaid: 0, totalOwed: 0 });
        return reply.send({
            success: true,
            data: {
                student: { id: student.id, fullName: student.fullName },
                attendances: attendances.map((attendance) => {
                    const fee = Number(attendance.session.sessionPrice);
                    const paid = Number(attendance.amountPaid);
                    return {
                        id: attendance.id,
                        sessionId: attendance.session.id,
                        sessionTitle: attendance.session.title,
                        teacherName: attendance.session.teacher.fullName,
                        startTime: attendance.session.startTime.toISOString(),
                        checkInTime: attendance.checkInTime.toISOString(),
                        amountPaid: paid,
                        sessionPrice: fee,
                        remainingDue: Math.max(fee - paid, 0),
                        changeOwed: Number(attendance.changeOwed),
                        paymentMethod: attendance.paymentMethod,
                        status: attendance.status,
                        deskIdentifier: attendance.shiftRegister.deskIdentifier,
                    };
                }),
                summary: { ...summary, totalPaid: Number(summary.totalPaid.toFixed(2)), totalOwed: Number(summary.totalOwed.toFixed(2)), sessions: attendances.length },
            },
        });
    });
    app.delete('/students/:id', { preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable], schema: { params: uuidParamsSchema } }, async (request, reply) => { if (!isValidUUID(request.params.id))
        return reply.code(400).send(invalid('معرّف الطالب غير صالح.', 'The student id is invalid.')); const tenantId = request.user.tenantId; if (!tenantId)
        return reply.code(400).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_REQUIRED')); try {
        await prisma.student.delete({ where: { id: request.params.id, tenantId } });
        return reply.send({ success: true, data: null });
    }
    catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
            return reply.code(404).send(invalid('الطالب غير موجود.', 'Student not found.', 'STUDENT_NOT_FOUND'));
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003')
            return reply.code(409).send(invalid('لا يمكن حذف طالب له سجل حضور.', 'A student with attendance records cannot be deleted.', 'STUDENT_IN_USE'));
        throw error;
    } });
};
export default studentRoutes;
