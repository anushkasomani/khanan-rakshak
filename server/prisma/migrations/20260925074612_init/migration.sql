-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "role" TEXT,
    "officerType" TEXT,
    "trade" TEXT,
    "specialistType" TEXT,
    "shift" TEXT,
    "districtId" TEXT,
    "contractId" TEXT,
    "trainingValidUntil" TIMESTAMP(3),
    "phone" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "badgeNumber" TEXT,
    "mineId" TEXT,
    "department" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mine" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "shiftStartHour" INTEGER NOT NULL DEFAULT 6,
    "region" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "locality" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radiusMeters" INTEGER NOT NULL DEFAULT 500,
    "complianceScore" DOUBLE PRECISION NOT NULL DEFAULT 92.5,
    "activeWorkers" INTEGER NOT NULL DEFAULT 420,
    "status" TEXT NOT NULL DEFAULT 'OPERATIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mineId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkInAccuracy" DOUBLE PRECISION,
    "checkInDistance" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'GPS',
    "markedById" TEXT,
    "markedByName" TEXT,
    "note" TEXT,
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "checkOutDistance" DOUBLE PRECISION,
    "syncedLate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "mineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldReport" (
    "id" TEXT NOT NULL,
    "mineId" TEXT NOT NULL,
    "districtId" TEXT,
    "authorId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "workDate" TEXT NOT NULL,
    "body" TEXT,
    "tableData" TEXT,
    "photos" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "recordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "mineId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "workType" TEXT NOT NULL,
    "reference" TEXT,
    "districtId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "statusNote" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftReport" (
    "id" TEXT NOT NULL,
    "mineId" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "sirdarId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "checks" TEXT NOT NULL DEFAULT '{}',
    "methanePct" DOUBLE PRECISION,
    "restrictions" TEXT,
    "notes" TEXT,
    "history" TEXT NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenById" TEXT,
    "seenByName" TEXT,
    "seenAt" TIMESTAMP(3),
    "seenNote" TEXT,
    "handoverNote" TEXT,
    "handoverAt" TIMESTAMP(3),
    "recordHash" TEXT,

    CONSTRAINT "ShiftReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "mineId" TEXT NOT NULL,
    "districtId" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "immediateActionTaken" TEXT,
    "imageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "assignedOfficer" TEXT,
    "fixedById" TEXT,
    "fixedByName" TEXT,
    "fixedAt" TIMESTAMP(3),
    "fixNote" TEXT,
    "verifiedByName" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifyNote" TEXT,
    "inspectionId" TEXT,
    "recordHash" TEXT,
    "rewardPointsAwarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grievance" (
    "id" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "anonymityType" TEXT NOT NULL DEFAULT 'ANONYMOUS',
    "submitterId" TEXT,
    "mineId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "escalationTier" TEXT NOT NULL DEFAULT 'MINE_OFFICER',
    "timeline" TEXT NOT NULL DEFAULT '[]',
    "recordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grievance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SosAlert" (
    "id" TEXT NOT NULL,
    "workerIdentifier" TEXT NOT NULL,
    "triggeredById" TEXT,
    "mineId" TEXT NOT NULL,
    "districtId" TEXT,
    "emergencyType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ALERT_TRIGGERED',
    "assignedTeams" TEXT,
    "responderNotes" TEXT,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SosAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "mineId" TEXT NOT NULL,
    "inspectorName" TEXT NOT NULL,
    "inspectionType" TEXT NOT NULL,
    "checklistData" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "violationsCount" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "recordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "title" TEXT,
    "hazardId" TEXT,
    "assignedToId" TEXT,
    "assignedById" TEXT,
    "assignedByName" TEXT,
    "outcome" TEXT,
    "submissionNote" TEXT,
    "photos" TEXT NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3),
    "submitLat" DOUBLE PRECISION,
    "submitLng" DOUBLE PRECISION,
    "submitDistance" DOUBLE PRECISION,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectiveAction" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "actionRequired" TEXT NOT NULL,
    "responsiblePerson" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "evidence" TEXT,
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CorrectiveAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "incidentType" TEXT NOT NULL,
    "mineId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "peopleAffected" INTEGER NOT NULL DEFAULT 0,
    "immediateResponse" TEXT NOT NULL,
    "rootCause" TEXT,
    "correctiveActionId" TEXT,
    "reportedById" TEXT,
    "reportedByName" TEXT,
    "contractId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INVESTIGATING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditBlock" (
    "id" SERIAL NOT NULL,
    "blockIndex" INTEGER NOT NULL,
    "previousHash" TEXT NOT NULL,
    "currentHash" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedByRole" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payloadSummary" TEXT NOT NULL,

    CONSTRAINT "AuditBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceAnalysis" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scope" TEXT NOT NULL DEFAULT 'all_mines',
    "mineIds" TEXT NOT NULL,
    "questionHash" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "analytics" TEXT NOT NULL,

    CONSTRAINT "GovernanceAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "evaluationType" TEXT NOT NULL,
    "configuration" TEXT NOT NULL DEFAULT '{}',
    "requiredEvidenceType" TEXT,
    "sourceReference" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCheck" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "mineId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "expectedValue" TEXT NOT NULL,
    "actualValue" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "evidenceRefs" TEXT NOT NULL DEFAULT '[]',
    "violationSummary" TEXT,
    "correctiveActionIds" TEXT NOT NULL DEFAULT '[]',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecognitionPoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pointsAwarded" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "verifiedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecognitionPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "mineId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "mineId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severe" BOOLEAN NOT NULL DEFAULT false,
    "fromUserId" TEXT NOT NULL,
    "toRole" TEXT NOT NULL,
    "toOfficerType" TEXT,
    "reason" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "callStatus" TEXT NOT NULL DEFAULT 'NONE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "acknowledgedById" TEXT,
    "acknowledgedByName" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ComplianceRuleMines" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "Mine_code_key" ON "Mine"("code");

-- CreateIndex
CREATE INDEX "Attendance_mineId_date_idx" ON "Attendance"("mineId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_userId_date_key" ON "Attendance"("userId", "date");

-- CreateIndex
CREATE INDEX "FieldReport_mineId_createdAt_idx" ON "FieldReport"("mineId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_name_key" ON "Contractor"("name");

-- CreateIndex
CREATE INDEX "Contract_mineId_status_idx" ON "Contract"("mineId", "status");

-- CreateIndex
CREATE INDEX "ShiftReport_mineId_date_shift_idx" ON "ShiftReport"("mineId", "date", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftReport_districtId_date_shift_key" ON "ShiftReport"("districtId", "date", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "Grievance_trackingCode_key" ON "Grievance"("trackingCode");

-- CreateIndex
CREATE UNIQUE INDEX "AuditBlock_blockIndex_key" ON "AuditBlock"("blockIndex");

-- CreateIndex
CREATE INDEX "GovernanceAnalysis_requestedAt_idx" ON "GovernanceAnalysis"("requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRule_code_key" ON "ComplianceRule"("code");

-- CreateIndex
CREATE INDEX "ComplianceRule_active_category_idx" ON "ComplianceRule"("active", "category");

-- CreateIndex
CREATE INDEX "ComplianceCheck_mineId_status_checkedAt_idx" ON "ComplianceCheck"("mineId", "status", "checkedAt");

-- CreateIndex
CREATE INDEX "ComplianceCheck_ruleId_checkedAt_idx" ON "ComplianceCheck"("ruleId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceCheck_ruleId_mineId_periodKey_key" ON "ComplianceCheck"("ruleId", "mineId", "periodKey");

-- CreateIndex
CREATE INDEX "Escalation_recordType_recordId_idx" ON "Escalation"("recordType", "recordId");

-- CreateIndex
CREATE INDEX "Escalation_mineId_toRole_status_idx" ON "Escalation"("mineId", "toRole", "status");

-- CreateIndex
CREATE UNIQUE INDEX "_ComplianceRuleMines_AB_unique" ON "_ComplianceRuleMines"("A", "B");

-- CreateIndex
CREATE INDEX "_ComplianceRuleMines_B_index" ON "_ComplianceRuleMines"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_mineId_fkey" FOREIGN KEY ("mineId") REFERENCES "Mine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_mineId_fkey" FOREIGN KEY ("mineId") REFERENCES "Mine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_mineId_fkey" FOREIGN KEY ("mineId") REFERENCES "Mine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldReport" ADD CONSTRAINT "FieldReport_mineId_fkey" FOREIGN KEY ("mineId") REFERENCES "Mine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldReport" ADD CONSTRAINT "FieldReport_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldReport" ADD CONSTRAINT "FieldReport_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_mineId_fkey" FOREIGN KEY ("mineId") REFERENCES "Mine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftReport" ADD CONSTRAINT "ShiftReport_mineId_fkey" FOREIGN KEY ("mineId") REFERENCES "Mine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftReport" ADD CONSTRAINT "ShiftReport_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftReport" ADD CONSTRAINT "ShiftReport_sirdarId_fkey" FOREIGN KEY ("sirdarId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyReport" ADD CONSTRAINT "SafetyReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyReport" ADD CONSTRAINT "SafetyReport_mineId_fkey" FOREIGN KEY ("mineId") REFERENCES "Mine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyReport" ADD CONSTRAINT "SafetyReport_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grievance" ADD CONSTRAINT "Grievance_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grievance" ADD CONSTRAINT "Grievance_mineId_fkey" FOREIGN KEY ("mineId") REFERENCES "Mine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SosAlert" ADD CONSTRAINT "SosAlert_mineId_fkey" FOREIGN KEY ("mineId") REFERENCES "Mine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SosAlert" ADD CONSTRAINT "SosAlert_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_mineId_fkey" FOREIGN KEY ("mineId") REFERENCES "Mine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_mineId_fkey" FOREIGN KEY ("mineId") REFERENCES "Mine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ComplianceRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_mineId_fkey" FOREIGN KEY ("mineId") REFERENCES "Mine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecognitionPoint" ADD CONSTRAINT "RecognitionPoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_mineId_fkey" FOREIGN KEY ("mineId") REFERENCES "Mine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_mineId_fkey" FOREIGN KEY ("mineId") REFERENCES "Mine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ComplianceRuleMines" ADD CONSTRAINT "_ComplianceRuleMines_A_fkey" FOREIGN KEY ("A") REFERENCES "ComplianceRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ComplianceRuleMines" ADD CONSTRAINT "_ComplianceRuleMines_B_fkey" FOREIGN KEY ("B") REFERENCES "Mine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
