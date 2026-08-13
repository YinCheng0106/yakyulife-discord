export class DomainError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class ExpectedStateError extends DomainError {
  public constructor(message: string) {
    super(message);
    this.name = "ExpectedStateError";
  }
}

export class ActiveCareerExistsError extends ExpectedStateError {
  public constructor() {
    super("這個使用者已有進行中的生涯");
    this.name = "ActiveCareerExistsError";
  }
}
