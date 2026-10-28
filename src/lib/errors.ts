/** An error whose message is safe to show to the user. */
export class AppError extends Error {
  readonly status: number;
  readonly publicMessage: string;
  constructor(status: number, publicMessage: string) {
    super(publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The page or record you asked for could not be found.') {
    super(404, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do that.') {
    super(403, message);
  }
}

export class ValidationError extends AppError {
  readonly fieldErrors: { field: string; message: string }[];
  constructor(fieldErrors: { field: string; message: string }[]) {
    super(400, 'Some details need attention.');
    this.fieldErrors = fieldErrors;
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}
