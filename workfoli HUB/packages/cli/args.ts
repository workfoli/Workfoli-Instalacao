export interface ParsedArgs { positional: string[]; flags: Record<string, string | true>; }

const BOOLEAN_FLAGS = new Set(['apply', 'json', 'once', 'recover', 'templates', 'with-hub', 'no-git', 'base-template', 'help', 'open', 'dry-run']);

/** Parser mínimo: `--flag valor`, `--flag=valor` e booleanos conhecidos. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === '--') { positional.push(...argv.slice(index + 1)); break; }
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
      if (inline !== undefined) flags[name] = inline;
      else if (BOOLEAN_FLAGS.has(name) || index + 1 >= argv.length || argv[index + 1]!.startsWith('--')) flags[name] = true;
      else flags[name] = argv[++index]!;
    } else if (arg === '-h') flags.help = true;
    else positional.push(arg);
  }
  return { positional, flags };
}

export function flag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === 'string' ? value : undefined;
}

export function has(args: ParsedArgs, name: string): boolean {
  return args.flags[name] !== undefined;
}

export function intFlag(args: ParsedArgs, name: string): number | undefined {
  const value = flag(args, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`--${name} precisa ser um número inteiro.`);
  return parsed;
}
