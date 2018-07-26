declare module "jsonparse" {
  class Parser {
    onValue(value: any): void
    onError(error: any): void
    write(buffer: any): void
  }
  export = Parser
}
