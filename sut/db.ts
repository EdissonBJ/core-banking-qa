import { Pool, types } from "pg";
import dotenv from "dotenv";

dotenv.config();

// OID 20 = BIGINT. pg lo devuelve como string por defecto para no perder
// precisión; en este proyecto de práctica los montos (centavos) se mantienen
// muy por debajo de Number.MAX_SAFE_INTEGER, así que parseamos a number para
// simplificar el resto del código.
types.setTypeParser(20, (value: string) => parseInt(value, 10));

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL no está definida. Copiá .env.example a .env en la raíz del repo."
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
