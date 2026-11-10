-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'lectura',
    "passwordHash" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoHasta" TIMESTAMP(3),
    "invitacionHash" TEXT,
    "invitacionExpira" TIMESTAMP(3),
    "ultimoAcceso" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sesion" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expira" TIMESTAMP(3) NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agente" TEXT,

    CONSTRAINT "Sesion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_invitacionHash_key" ON "Usuario"("invitacionHash");

-- CreateIndex
CREATE UNIQUE INDEX "Sesion_tokenHash_key" ON "Sesion"("tokenHash");

-- CreateIndex
CREATE INDEX "Sesion_usuarioId_idx" ON "Sesion"("usuarioId");

-- AddForeignKey
ALTER TABLE "Sesion" ADD CONSTRAINT "Sesion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Usuarios iniciales (sin contraseña: cada quien la elige con su link de
-- activación, que genera el administrador en /usuarios). La cuenta de
-- sistemas se activa la primera vez con la clave APP_PASSWORD.
INSERT INTO "Usuario" ("id", "email", "nombre", "rol") VALUES
  (gen_random_uuid()::text, 'sistemas@machineryhunters.com', 'Fernando (Sistemas)', 'total'),
  (gen_random_uuid()::text, 'jaime@machineryhunters.com', 'Jaime Zamudio', 'operacion'),
  (gen_random_uuid()::text, 'raul.favela@machineryhunters.com', 'Raúl Favela', 'operacion'),
  (gen_random_uuid()::text, 'alma@machineryhunters.com', 'Alma', 'lectura')
ON CONFLICT ("email") DO NOTHING;
