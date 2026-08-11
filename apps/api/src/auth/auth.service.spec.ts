import { describe, expect, it, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import type { PrismaService } from '../common/prisma.service';

function makeService() {
  const users = new Map<string, { id: string; email: string; name: string | null; passwordHash: string | null }>();
  let nextId = 1;

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) return users.get(where.email) ?? null;
        if (where.id) return [...users.values()].find((u) => u.id === where.id) ?? null;
        return null;
      }),
      create: vi.fn(async ({ data }: { data: { email: string; passwordHash: string; name: string | null } }) => {
        const user = { id: `u${nextId++}`, email: data.email, name: data.name, passwordHash: data.passwordHash };
        users.set(user.email, user);
        return user;
      }),
    },
  } as unknown as PrismaService;

  const jwt = new JwtService({ secret: 'test-secret' });
  const service = new AuthService(prisma, jwt);
  return { service, prisma };
}

describe('AuthService', () => {
  it('registers a user and returns a usable token', async () => {
    const { service } = makeService();
    const result = await service.register('Alice@Example.com', 'correct-horse-battery');
    expect(result.user.email).toBe('alice@example.com');
    expect(result.token).toBeTruthy();
  });

  it('rejects a weak password', async () => {
    const { service } = makeService();
    await expect(service.register('a@b.com', 'short')).rejects.toThrow(/at least/);
  });

  it('rejects a duplicate email', async () => {
    const { service } = makeService();
    await service.register('a@b.com', 'correct-horse-battery');
    await expect(service.register('a@b.com', 'another-password')).rejects.toThrow(/already exists/);
  });

  it('logs in with the right password and rejects the wrong one', async () => {
    const { service } = makeService();
    await service.register('a@b.com', 'correct-horse-battery');

    const ok = await service.login('a@b.com', 'correct-horse-battery');
    expect(ok.user.email).toBe('a@b.com');

    await expect(service.login('a@b.com', 'wrong-password')).rejects.toThrow(/invalid email or password/);
  });

  it('gives the same error for an unknown email as a wrong password', async () => {
    const { service } = makeService();
    await service.register('a@b.com', 'correct-horse-battery');

    const unknown = service.login('nobody@b.com', 'whatever-password').catch((e: Error) => e.message);
    const wrong = service.login('a@b.com', 'wrong-password-here').catch((e: Error) => e.message);
    expect(await unknown).toBe(await wrong);
  });
});
