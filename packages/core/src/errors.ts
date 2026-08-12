export class DomainError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class ActiveCareerExistsError extends DomainError {
  public constructor() {
    super("這個使用者已有進行中的生涯");
    this.name = "ActiveCareerExistsError";
  }
}
