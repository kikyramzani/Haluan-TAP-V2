-- CreateTable
CREATE TABLE "CronRun" (
    "job" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "removed" INTEGER,
    "expiredSessionsRemoved" INTEGER,
    "error" TEXT,
    "details" JSONB,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("job")
);
