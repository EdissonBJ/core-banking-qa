/**
 * Wrapper mínimo sobre `claude -p` para el agente de soporte y su juez de
 * evals. Se eligió `claude -p` en vez del SDK/API HTTP de Anthropic (ambas
 * opciones válidas, ver el pedido original) para no agregar una dependencia
 * nueva y para reusar exactamente el mismo mecanismo de sandboxing que ya
 * se validó en src/agents/triage.ts.
 *
 * Cada invocación:
 *   --tools ""          sin herramientas: solo puede leer el prompt y
 *                        devolver texto/JSON, no puede tocar archivos, red
 *                        ni shell.
 *   --restricted         refuerzo adicional (ver --help): confina archivos,
 *                        ignora settings de usuario/proyecto, rechaza
 *                        bypassPermissions.
 *   --strict-mcp-config   sin esto, la sesión hereda los MCP servers ya
 *                        configurados (chrome, artifacts, etc.) y el costo
 *                        se dispara ~200x por las definiciones de
 *                        herramientas que de todos modos no se pueden usar
 *                        (medido: $0.52 → $0.0024 por invocación trivial).
 *   --system-prompt       reemplaza el prompt por defecto de Claude Code
 *                        por completo — el modelo no tiene ninguna noción
 *                        de ser "Claude Code", solo lo que se le pasa acá.
 */

import { execFileSync } from "node:child_process";

function baseArgs(systemPrompt: string): string[] {
  const args = ["-p", "--tools", "", "--restricted", "--strict-mcp-config", "--system-prompt", systemPrompt];
  // --bare evita cargar hooks/CLAUDE.md/memoria (innecesario para una
  // llamada de una sola vuelta) pero exige ANTHROPIC_API_KEY explícita, que
  // es la autenticación que va a tener un runner de CI/CD — no la que hay
  // en una sesión local por OAuth/keychain, así que solo se agrega cuando
  // la variable está presente.
  if (process.env.ANTHROPIC_API_KEY) {
    args.push("--bare");
  }
  return args;
}

function invoke(args: string[], input: string): string {
  return execFileSync("claude", args, {
    input,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  });
}

export function askText(systemPrompt: string, userMessage: string): string {
  return invoke(baseArgs(systemPrompt), userMessage).trim();
}

export function askStructured<T>(systemPrompt: string, userMessage: string, jsonSchema: object): T {
  const args = [...baseArgs(systemPrompt), "--output-format", "json", "--json-schema", JSON.stringify(jsonSchema)];
  const stdout = invoke(args, userMessage);
  const parsed = JSON.parse(stdout);
  if (parsed.is_error || !parsed.structured_output) {
    throw new Error(`claude -p no devolvió salida estructurada: ${JSON.stringify(parsed).slice(0, 500)}`);
  }
  return parsed.structured_output as T;
}
