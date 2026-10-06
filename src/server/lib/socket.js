import { Role } from '../../shared/constants/index.js';
import { config } from '../config/index.js';
import { extractCookieHeader, unsignCookieValue } from './security.js';
const ACCESS_TOKEN_COOKIE = 'access_token';
const LOBBY_STAFF_ROLES = [Role.ADMIN, Role.RECEPTIONIST];
/**
 * Cross-tenant oversight room, used only by users who belong to no single
 * center (a super admin watching every center at once). Tenant staff must never
 * be placed in it: doing so leaks one center's check-in and void events, which
 * carry student names and session details, to every other center.
 */
const PLATFORM_LOBBY_ROOM = 'center:lobby';
/**
 * The single source of truth for lobby room names.
 *
 * This used to be spelled out as `'center:lobby'` in three separate places,
 * which is how a tenant-scoped broadcast and a tenant-less broadcast drifted
 * apart and ended up leaking across centers. Both the join handler and every
 * emitter must go through here.
 */
export function lobbyRoomFor(tenantId) {
    return tenantId ? `tenant:${tenantId}:lobby` : PLATFORM_LOBBY_ROOM;
}
export function buildLobbyAttendancePayload(event) {
    return {
        ...event,
        timestamp: event.timestamp.toISOString(),
    };
}
/** Reject unauthenticated socket connections; require a valid staff JWT. */
export function createSocketAuthMiddleware(app) {
    return async function socketAuthMiddleware(socket, next) {
        try {
            const handshakeAuth = socket.handshake.auth;
            let token = handshakeAuth?.token;
            if (!token) {
                const cookieHeader = socket.handshake.headers.cookie;
                const signedValue = extractCookieHeader(cookieHeader, ACCESS_TOKEN_COOKIE);
                if (signedValue) {
                    token = unsignCookieValue(signedValue, config.cookieSecret) ?? undefined;
                }
            }
            if (!token)
                return next(new Error('unauthorized'));
            const payload = await app.jwt.verify(token);
            if (!payload || !payload.sub || !LOBBY_STAFF_ROLES.includes(payload.role)) {
                return next(new Error('forbidden'));
            }
            socket.data.user = { sub: payload.sub, username: payload.username, role: payload.role, tenantId: payload.tenantId };
            next();
        }
        catch {
            next(new Error('unauthorized'));
        }
    };
}
export function attachSocketServer(app, io) {
    io.use(createSocketAuthMiddleware(app));
    io.on('connection', (socket) => {
        socket.on('join:lobby', async () => {
            const user = socket.data.user;
            if (!user || !LOBBY_STAFF_ROLES.includes(user.role)) {
                socket.emit('lobby:denied', { code: 'FORBIDDEN', message: 'ليس لديك صلاحية لمشاهدة لوحة الاستقبال.', messageEn: 'You do not have permission to view the lobby.' });
                return;
            }
            // Exactly one room, and for a tenant user it is that center's own room.
            // Joining the shared room as well would hand this socket every other
            // center's lobby traffic.
            const room = lobbyRoomFor(user.tenantId);
            await socket.join(room);
            socket.emit('lobby:joined', { room, joinedAt: new Date().toISOString() });
        });
        socket.on('leave:lobby', async () => {
            const user = socket.data.user;
            const room = lobbyRoomFor(user?.tenantId);
            await socket.leave(room);
            socket.emit('lobby:left', { room, leftAt: new Date().toISOString() });
        });
    });
    app.decorate('io', io);
}
