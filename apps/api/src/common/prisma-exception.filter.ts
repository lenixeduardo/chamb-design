import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Turns Prisma's error codes into the HTTP status they actually mean.
 *
 * Without this every constraint violation is an anonymous 500: deleting a
 * project that does not exist, creating one for an unknown user, saving a
 * duplicate slug. All three are the *caller's* mistake and all three told them
 * nothing. The message is written here rather than forwarded — Prisma's own
 * text names tables and columns, which is more than a client needs to know.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, message } = translate(exception);

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`unmapped Prisma error ${exception.code}: ${exception.message}`);
    }

    response.status(status).json({ statusCode: status, message, error: exception.code });
  }
}

function translate(exception: Prisma.PrismaClientKnownRequestError): {
  status: number;
  message: string;
} {
  switch (exception.code) {
    case 'P2025':
      return { status: HttpStatus.NOT_FOUND, message: 'the record does not exist' };
    case 'P2002':
      return { status: HttpStatus.CONFLICT, message: 'a record with that value already exists' };
    case 'P2003':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'the request references a record that does not exist',
      };
    case 'P2000':
      return { status: HttpStatus.BAD_REQUEST, message: 'a value is too long for its column' };
    default:
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'internal server error' };
  }
}
