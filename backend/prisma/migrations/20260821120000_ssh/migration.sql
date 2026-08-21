-- CreateTable
CREATE TABLE "SshCredential" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "keyType" TEXT,
    "publicKey" TEXT,
    "fingerprintSha256" TEXT,
    "hasPassphrase" BOOLEAN NOT NULL DEFAULT false,
    "secretCiphertext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SshCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SshHost" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "username" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL,
    "credentialId" TEXT,
    "groupName" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "color" TEXT NOT NULL DEFAULT '#8E8E93',
    "keepalive" BOOLEAN NOT NULL DEFAULT true,
    "startupCommand" TEXT,
    "lastConnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SshHost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SshKnownHost" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "keyType" TEXT NOT NULL,
    "fingerprintSha256" TEXT NOT NULL,
    "trustedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SshKnownHost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SshSession" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "hostId" TEXT,
    "status" TEXT NOT NULL,
    "cols" INTEGER NOT NULL DEFAULT 80,
    "rows" INTEGER NOT NULL DEFAULT 24,
    "errorMessage" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "SshSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SshSnippet" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "tag" TEXT,
    "requireConfirm" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SshSnippet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SshKnownHost_ownerId_address_port_keyType_key" ON "SshKnownHost"("ownerId", "address", "port", "keyType");

-- AddForeignKey
ALTER TABLE "SshCredential" ADD CONSTRAINT "SshCredential_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SshHost" ADD CONSTRAINT "SshHost_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SshHost" ADD CONSTRAINT "SshHost_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "SshCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SshKnownHost" ADD CONSTRAINT "SshKnownHost_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SshSession" ADD CONSTRAINT "SshSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SshSession" ADD CONSTRAINT "SshSession_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "SshHost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SshSnippet" ADD CONSTRAINT "SshSnippet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
