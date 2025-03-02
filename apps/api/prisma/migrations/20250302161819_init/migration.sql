/*
  Warnings:

  - You are about to drop the column `parentId` on the `Element` table. All the data in the column will be lost.
  - You are about to drop the column `scanId` on the `Element` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `scanId` on the `Prompt` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedImpact` on the `Recommendation` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Analysis` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Scan` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `pageScanId` to the `Element` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Element` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Preview` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ownerId` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pageScanId` to the `Prompt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Prompt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Recommendation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passwordHash` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Analysis" DROP CONSTRAINT "Analysis_scanId_fkey";

-- DropForeignKey
ALTER TABLE "Element" DROP CONSTRAINT "Element_parentId_fkey";

-- DropForeignKey
ALTER TABLE "Element" DROP CONSTRAINT "Element_scanId_fkey";

-- DropForeignKey
ALTER TABLE "Preview" DROP CONSTRAINT "Preview_recommendationId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_userId_fkey";

-- DropForeignKey
ALTER TABLE "Prompt" DROP CONSTRAINT "Prompt_scanId_fkey";

-- DropForeignKey
ALTER TABLE "Recommendation" DROP CONSTRAINT "Recommendation_promptId_fkey";

-- DropForeignKey
ALTER TABLE "Scan" DROP CONSTRAINT "Scan_projectId_fkey";

-- AlterTable
ALTER TABLE "Element" DROP COLUMN "parentId",
DROP COLUMN "scanId",
ADD COLUMN     "pageScanId" TEXT NOT NULL,
ADD COLUMN     "parentElementId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "hierarchyLevel" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Preview" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "userId",
ADD COLUMN     "ownerId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Prompt" DROP COLUMN "scanId",
ADD COLUMN     "pageScanId" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Recommendation" DROP COLUMN "estimatedImpact",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "name",
DROP COLUMN "password",
ADD COLUMN     "passwordHash" TEXT NOT NULL;

-- DropTable
DROP TABLE "Analysis";

-- DropTable
DROP TABLE "Scan";

-- CreateTable
CREATE TABLE "PageScan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "htmlSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PageScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteStructureAnalysis" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "totalPages" INTEGER NOT NULL,
    "maxDepth" INTEGER NOT NULL,
    "sitemapData" JSONB NOT NULL,
    "hierarchyData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteStructureAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SEOAnalysis" (
    "id" TEXT NOT NULL,
    "pageScanId" TEXT NOT NULL,
    "hasTitle" BOOLEAN NOT NULL,
    "hasDescription" BOOLEAN NOT NULL,
    "titleLength" INTEGER,
    "descriptionLength" INTEGER,
    "headingsStructure" JSONB NOT NULL,
    "textToHtmlRatio" DOUBLE PRECISION NOT NULL,
    "keywordDensity" JSONB NOT NULL,
    "hasDuplicateContent" BOOLEAN NOT NULL,
    "hasCanonicalUrl" BOOLEAN NOT NULL,
    "hasSitemap" BOOLEAN NOT NULL,
    "hasRobotsTxt" BOOLEAN NOT NULL,
    "schemaOrgData" JSONB,
    "metaTagsIssues" JSONB,
    "headingsIssues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SEOAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalAnalysis" (
    "id" TEXT NOT NULL,
    "pageScanId" TEXT NOT NULL,
    "pageLoadTime" DOUBLE PRECISION NOT NULL,
    "firstContentfulPaint" DOUBLE PRECISION NOT NULL,
    "timeToInteractive" DOUBLE PRECISION NOT NULL,
    "htmlSize" INTEGER NOT NULL,
    "cssSize" INTEGER NOT NULL,
    "jsSize" INTEGER NOT NULL,
    "totalImageSize" INTEGER NOT NULL,
    "imageCount" INTEGER NOT NULL,
    "requestCount" INTEGER NOT NULL,
    "requestTypes" JSONB NOT NULL,
    "serverResponseTime" DOUBLE PRECISION NOT NULL,
    "serverErrors" JSONB,
    "cachingHeaders" JSONB,
    "usesCDN" BOOLEAN NOT NULL,
    "performanceIssues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicalAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkAnalysis" (
    "id" TEXT NOT NULL,
    "pageScanId" TEXT NOT NULL,
    "internalLinksCount" INTEGER NOT NULL,
    "externalLinksCount" INTEGER NOT NULL,
    "brokenLinksCount" INTEGER NOT NULL,
    "internalLinks" JSONB NOT NULL,
    "externalLinks" JSONB NOT NULL,
    "brokenLinks" JSONB,
    "anchorTexts" JSONB NOT NULL,
    "noFollowLinks" JSONB,
    "linkStructure" JSONB,
    "linkIssues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileAnalysis" (
    "id" TEXT NOT NULL,
    "pageScanId" TEXT NOT NULL,
    "isResponsive" BOOLEAN NOT NULL,
    "hasViewport" BOOLEAN NOT NULL,
    "tapTargetIssues" BOOLEAN NOT NULL,
    "hasMobileVersion" BOOLEAN NOT NULL,
    "mobileLoadTime" DOUBLE PRECISION NOT NULL,
    "mobileScore" DOUBLE PRECISION NOT NULL,
    "viewportIssues" JSONB,
    "tapTargetData" JSONB,
    "mobileIssues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAnalysis" (
    "id" TEXT NOT NULL,
    "pageScanId" TEXT NOT NULL,
    "contentLength" INTEGER NOT NULL,
    "contentUniqueness" DOUBLE PRECISION NOT NULL,
    "keywordCount" INTEGER NOT NULL,
    "keywordDistribution" JSONB NOT NULL,
    "readabilityScore" DOUBLE PRECISION NOT NULL,
    "formattingQuality" DOUBLE PRECISION NOT NULL,
    "textToMediaRatio" DOUBLE PRECISION NOT NULL,
    "contentIssues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAnalysis" (
    "id" TEXT NOT NULL,
    "pageScanId" TEXT NOT NULL,
    "usesHttps" BOOLEAN NOT NULL,
    "hasMixedContent" BOOLEAN NOT NULL,
    "sslInfo" JSONB,
    "securityHeaders" JSONB,
    "owaspIssues" JSONB,
    "securityIssues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageScan_projectId_idx" ON "PageScan"("projectId");

-- CreateIndex
CREATE INDEX "PageScan_url_idx" ON "PageScan"("url");

-- CreateIndex
CREATE INDEX "PageScan_status_idx" ON "PageScan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SiteStructureAnalysis_projectId_key" ON "SiteStructureAnalysis"("projectId");

-- CreateIndex
CREATE INDEX "SiteStructureAnalysis_projectId_idx" ON "SiteStructureAnalysis"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SEOAnalysis_pageScanId_key" ON "SEOAnalysis"("pageScanId");

-- CreateIndex
CREATE INDEX "SEOAnalysis_pageScanId_idx" ON "SEOAnalysis"("pageScanId");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalAnalysis_pageScanId_key" ON "TechnicalAnalysis"("pageScanId");

-- CreateIndex
CREATE INDEX "TechnicalAnalysis_pageScanId_idx" ON "TechnicalAnalysis"("pageScanId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkAnalysis_pageScanId_key" ON "LinkAnalysis"("pageScanId");

-- CreateIndex
CREATE INDEX "LinkAnalysis_pageScanId_idx" ON "LinkAnalysis"("pageScanId");

-- CreateIndex
CREATE UNIQUE INDEX "MobileAnalysis_pageScanId_key" ON "MobileAnalysis"("pageScanId");

-- CreateIndex
CREATE INDEX "MobileAnalysis_pageScanId_idx" ON "MobileAnalysis"("pageScanId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentAnalysis_pageScanId_key" ON "ContentAnalysis"("pageScanId");

-- CreateIndex
CREATE INDEX "ContentAnalysis_pageScanId_idx" ON "ContentAnalysis"("pageScanId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityAnalysis_pageScanId_key" ON "SecurityAnalysis"("pageScanId");

-- CreateIndex
CREATE INDEX "SecurityAnalysis_pageScanId_idx" ON "SecurityAnalysis"("pageScanId");

-- CreateIndex
CREATE INDEX "Element_pageScanId_idx" ON "Element"("pageScanId");

-- CreateIndex
CREATE INDEX "Element_type_idx" ON "Element"("type");

-- CreateIndex
CREATE INDEX "Element_parentElementId_idx" ON "Element"("parentElementId");

-- CreateIndex
CREATE INDEX "Preview_recommendationId_idx" ON "Preview"("recommendationId");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE INDEX "Prompt_pageScanId_idx" ON "Prompt"("pageScanId");

-- CreateIndex
CREATE INDEX "Prompt_targetUse_idx" ON "Prompt"("targetUse");

-- CreateIndex
CREATE INDEX "Recommendation_promptId_idx" ON "Recommendation"("promptId");

-- CreateIndex
CREATE INDEX "Recommendation_elementId_idx" ON "Recommendation"("elementId");

-- CreateIndex
CREATE INDEX "Recommendation_category_idx" ON "Recommendation"("category");

-- CreateIndex
CREATE INDEX "Recommendation_priority_idx" ON "Recommendation"("priority");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageScan" ADD CONSTRAINT "PageScan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Element" ADD CONSTRAINT "Element_pageScanId_fkey" FOREIGN KEY ("pageScanId") REFERENCES "PageScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Element" ADD CONSTRAINT "Element_parentElementId_fkey" FOREIGN KEY ("parentElementId") REFERENCES "Element"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteStructureAnalysis" ADD CONSTRAINT "SiteStructureAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEOAnalysis" ADD CONSTRAINT "SEOAnalysis_pageScanId_fkey" FOREIGN KEY ("pageScanId") REFERENCES "PageScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalAnalysis" ADD CONSTRAINT "TechnicalAnalysis_pageScanId_fkey" FOREIGN KEY ("pageScanId") REFERENCES "PageScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkAnalysis" ADD CONSTRAINT "LinkAnalysis_pageScanId_fkey" FOREIGN KEY ("pageScanId") REFERENCES "PageScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileAnalysis" ADD CONSTRAINT "MobileAnalysis_pageScanId_fkey" FOREIGN KEY ("pageScanId") REFERENCES "PageScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAnalysis" ADD CONSTRAINT "ContentAnalysis_pageScanId_fkey" FOREIGN KEY ("pageScanId") REFERENCES "PageScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityAnalysis" ADD CONSTRAINT "SecurityAnalysis_pageScanId_fkey" FOREIGN KEY ("pageScanId") REFERENCES "PageScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_pageScanId_fkey" FOREIGN KEY ("pageScanId") REFERENCES "PageScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preview" ADD CONSTRAINT "Preview_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
