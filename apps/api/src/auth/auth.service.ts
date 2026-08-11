import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const SALT_ROUNDS = 12;

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthResult {
  token: string;
  user: AuthenticatedUser;
}

/**
 * Password auth for the optional API server.
 *
 * This is the seam `ProjectsController` names in its own doc comment: a real
 * auth provider plugging in behind `x-user-id`. Every project route now
 * requires a valid token instead of trusting a caller-supplied header, so a
 * user's saved templates are reachable only by the account that owns them.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private static assertCredentialsShape(email: string, password: string): void {
    if (!EMAIL_RE.test(email.trim())) {
      throw new UnauthorizedException('enter a valid email address');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new UnauthorizedException(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
  }

  private issueToken(user: { id: string; email: string }): string {
    return this.jwt.sign({ sub: user.id, email: user.email });
  }

  async register(email: string, password: string, name?: string): Promise<AuthResult> {
    AuthService.assertCredentialsShape(email, password);
    const normalizedEmail = AuthService.normalizeEmail(email);

    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw new ConflictException('an account with that email already exists');

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: normalizedEmail, passwordHash, name: name?.trim() || null },
    });

    return {
      token: this.issueToken(user),
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = AuthService.normalizeEmail(email);
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    // Same rejection whether the account doesn't exist or the password is
    // wrong — distinguishing them would let a caller enumerate registered
    // emails one guess at a time.
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('invalid email or password');
    }

    return {
      token: this.issueToken(user),
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async me(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('account no longer exists');
    return { id: user.id, email: user.email, name: user.name };
  }
}
