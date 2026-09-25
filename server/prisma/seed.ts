import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuditService } from '../src/services/auditService';
import { indiaDate } from '../src/geo';
import { shiftDate, previousShift } from '../src/shifts';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding CoalGuard / MineSafe database...');

  // Clear existing
  await prisma.escalation.deleteMany();
  await prisma.fieldReport.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.shiftReport.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.userBadge.deleteMany();
  await prisma.recognitionPoint.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.auditBlock.deleteMany();
  await prisma.correctiveAction.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.sosAlert.deleteMany();
  await prisma.grievance.deleteMany();
  await prisma.safetyReport.deleteMany();
  await prisma.user.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.contractor.deleteMany();
  await prisma.district.deleteMany();
  await prisma.mine.deleteMany();

  // 1. Mines
  const dhanbad = await prisma.mine.create({
    data: {
      code: 'MINE-DHN-01',
      locality: 'Dhanbad',
      latitude: 23.7957,
      longitude: 86.4304,
      radiusMeters: 1200,
      name: 'Dhanbad Central Underground Colliery',
      company: 'Bharat Coking Coal Ltd',
      region: 'Jharkhand Coal Belt',
      state: 'Jharkhand',
      complianceScore: 94.2,
      activeWorkers: 640,
      status: 'OPERATIONAL',
      districts: {
        create: [
          { name: 'District 1', location: 'Seam IX north, Longwall 4, -240 m' },
          { name: 'District 2', location: 'Seam IX south, near Shaft 2 haulage, -180 m' },
          { name: 'District 3', location: 'Seam VII extraction face, -310 m' },
        ]
      }
    },
    include: { districts: { orderBy: { name: 'asc' } } }
  });

  const eastern = await prisma.mine.create({
    data: {
      code: 'MINE-ECL-04',
      locality: 'Raniganj',
      latitude: 23.6150,
      longitude: 87.1150,
      radiusMeters: 1000,
      name: 'Eastern Raniganj Seam Pit 4',
      company: 'Eastern Coalfields Ltd',
      region: 'Eastern Coalfields',
      state: 'West Bengal',
      complianceScore: 89.4,
      activeWorkers: 512,
      status: 'CAUTION',
      districts: {
        create: [
          { name: 'North District', location: 'Seam IV north face, -160 m' },
          { name: 'East District', location: 'East conveyor gallery, -140 m' },
          { name: 'South District', location: 'Near the drainage sump, -210 m' },
        ]
      }
    },
    include: { districts: { orderBy: { name: 'asc' } } }
  });

  const korba = await prisma.mine.create({
    data: {
      code: 'MINE-SECL-02',
      locality: 'Korba',
      latitude: 22.3595,
      longitude: 82.7501,
      radiusMeters: 1500,
      name: 'Korba Deep Underground Complex',
      company: 'South Eastern Coalfields Ltd',
      shiftStartHour: 7, // this mine runs 7 AM – 3 PM, 3 PM – 11 PM, 11 PM – 7 AM
      region: 'South Eastern Coalfields',
      state: 'Chhattisgarh',
      complianceScore: 96.8,
      activeWorkers: 780,
      status: 'OPERATIONAL',
      districts: {
        create: [
          { name: 'Panel A', location: 'Continuous miner panel, -280 m' },
          { name: 'Panel B', location: 'Near substation vault 1, -200 m' },
        ]
      }
    },
    include: { districts: { orderBy: { name: 'asc' } } }
  });

  const singrauli = await prisma.mine.create({
    data: {
      code: 'MINE-NCL-09',
      locality: 'Singrauli',
      latitude: 24.1997,
      longitude: 82.6750,
      radiusMeters: 2000,
      name: 'Singrauli OpenCast Basin',
      company: 'Northern Coalfields Ltd',
      region: 'Northern Coalfields',
      state: 'Madhya Pradesh',
      complianceScore: 92.1,
      activeWorkers: 490,
      status: 'OPERATIONAL',
      districts: {
        create: [
          { name: 'Coal Section', location: 'Bench 4, shovel 12' },
          { name: 'OB Section', location: 'Overburden benches and haul road C' },
        ]
      }
    },
    include: { districts: { orderBy: { name: 'asc' } } }
  });

  const jharia = await prisma.mine.create({
    data: {
      code: 'MINE-BCCL-07',
      locality: 'Jharia',
      latitude: 23.7470,
      longitude: 86.4150,
      radiusMeters: 900,
      name: 'Central Jharia Seam 9 Colliery',
      company: 'Bharat Coking Coal Ltd',
      region: 'Bharat Coking Coal',
      state: 'Jharkhand',
      complianceScore: 87.5,
      activeWorkers: 380,
      status: 'AUDIT_REQUIRED',
      districts: {
        create: [
          { name: 'District 1', location: 'Fire barrier stowing area, -150 m' },
          { name: 'District 2', location: 'Near Shaft 1 pit bottom, -220 m' },
        ]
      }
    },
    include: { districts: { orderBy: { name: 'asc' } } }
  });

  // 2. Users at Dhanbad, one mine with the full chain; plus a few at Korba and a pending registration to review.
  // Seed accounts use password "password123" via /api/auth/login; real users sign in with Google.
  const pw = await bcrypt.hash('password123', 10);
  const approved = { passwordHash: pw, status: 'APPROVED', reviewedAt: new Date() };
  const [d1, d2, d3] = dhanbad.districts;
  const at = (district: { id: string }, shift: string) => ({ mineId: dhanbad.id, districtId: district.id, shift });

  // Contractors. The owner and manager stay responsible for everyone working under a contract.
  const DAY = 86400000;
  const kumar = await prisma.contractor.create({ data: { name: 'Kumar Constructions', contactName: 'Vinod Kumar', phone: '+91 98350 30001' } });
  const singh = await prisma.contractor.create({ data: { name: 'Singh Earthmovers Pvt Ltd', contactName: 'Harpreet Singh', phone: '+91 98350 30002' } });
  const mahatoTransport = await prisma.contractor.create({ data: { name: 'Mahato Transport Co', contactName: 'Ravi Mahato', phone: '+91 98350 30003' } });
  const supportWork = await prisma.contract.create({
    data: {
      id: 'CON-2026-00012', mineId: dhanbad.id, contractorId: kumar.id, title: 'Roof bolting and support work, Districts 1 and 2',
      workType: 'SUPPORT_WORK', reference: 'BCCL/DHN/WO/2026/118', startDate: new Date(Date.now() - 120 * DAY), endDate: new Date(Date.now() + 10 * DAY),
      createdByName: 'Rajesh Verma',
    },
  });
  await prisma.contract.create({
    data: {
      id: 'CON-2026-00009', mineId: dhanbad.id, contractorId: mahatoTransport.id, title: 'Coal transport, pit head to railway siding',
      workType: 'COAL_TRANSPORT', reference: 'BCCL/DHN/WO/2025/342', startDate: new Date(Date.now() - 400 * DAY), endDate: new Date(Date.now() - 20 * DAY),
      status: 'ENDED', statusNote: 'Work order completed.', createdByName: 'Rajesh Verma',
    },
  });
  await prisma.contract.create({
    data: {
      id: 'CON-2026-00004', mineId: singrauli.id, contractorId: singh.id, title: 'Overburden removal, OB Section benches 3 to 6',
      workType: 'OB_REMOVAL', reference: 'NCL/SGR/LOA/2025/77', districtId: singrauli.districts[1].id,
      startDate: new Date(Date.now() - 200 * DAY), endDate: new Date(Date.now() + 500 * DAY), createdByName: 'System Admin',
    },
  });
  const contractWorker = { contractId: supportWork.id };

  // District 1, Shift A: Mohan's crew. District 2, Shift A: Suresh's crew. District 1, Shift B: Babulal's crew.
  const worker = await prisma.user.create({
    data: { ...approved, ...at(d1, 'A'), email: 'worker@minesafe.gov', name: 'Ramesh Kumar', role: 'WORKER', trade: 'DRILLER', phone: '+91 98350 10001', badgeNumber: 'W-4109', points: 75 }
  });
  await prisma.user.createMany({
    data: [
      { ...approved, ...at(d1, 'A'), email: 'sunita.electrician@minesafe.gov', name: 'Sunita Devi', role: 'WORKER', trade: 'ELECTRICIAN', phone: '+91 98350 10002', badgeNumber: 'W-4120', points: 20 },
      { ...approved, ...at(d1, 'A'), email: 'bablu.helper@minesafe.gov', name: 'Bablu Oraon', role: 'WORKER', trade: 'HELPER', phone: '+91 98350 10004', badgeNumber: 'W-4141' },
      { ...approved, ...at(d2, 'A'), email: 'arjun.operator@minesafe.gov', name: 'Arjun Mahto', role: 'WORKER', trade: 'OPERATOR', phone: '+91 98350 10003', badgeNumber: 'W-4133' },
      { ...approved, ...at(d2, 'A'), email: 'rafiq.loader@minesafe.gov', name: 'Rafiq Ansari', role: 'WORKER', trade: 'HELPER', phone: '+91 98350 10005', badgeNumber: 'W-4150' },
      { ...approved, ...at(d1, 'B'), email: 'gopal.driller@minesafe.gov', name: 'Gopal Rajak', role: 'WORKER', trade: 'DRILLER', phone: '+91 98350 10006', badgeNumber: 'W-4162' },
      // Kumar Constructions' crew: Salim's training is valid, Dinesh's lapsed last month so he can't check in.
      { ...approved, ...at(d1, 'A'), ...contractWorker, email: 'salim.contract@minesafe.gov', name: 'Salim Sheikh', role: 'WORKER', trade: 'FITTER', phone: '+91 98350 10007', badgeNumber: 'KC-201', trainingValidUntil: new Date(Date.now() + 200 * DAY) },
      { ...approved, ...at(d2, 'A'), ...contractWorker, email: 'dinesh.contract@minesafe.gov', name: 'Dinesh Paswan', role: 'WORKER', trade: 'HELPER', phone: '+91 98350 10008', badgeNumber: 'KC-214', trainingValidUntil: new Date(Date.now() - 25 * DAY) },
      { ...approved, ...at(d2, 'A'), ...contractWorker, email: 'manoj.contract@minesafe.gov', name: 'Manoj Turi', role: 'WORKER', trade: 'HELPER', phone: '+91 98350 10009', badgeNumber: 'KC-219', trainingValidUntil: new Date(Date.now() + 12 * DAY) },
      { ...approved, ...at(d3, 'A'), email: 'lakshmi.sirdar@minesafe.gov', name: 'Lakshmi Murmu', role: 'SIRDAR', phone: '+91 98350 10013', badgeNumber: 'SD-19' },
      { ...approved, ...at(d1, 'B'), email: 'babulal.sirdar@minesafe.gov', name: 'Babulal Soren', role: 'SIRDAR', phone: '+91 98350 10012', badgeNumber: 'SD-15' },
      { ...approved, ...at(d1, 'C'), email: 'ramu.sirdar@minesafe.gov', name: 'Ramu Tudu', role: 'SIRDAR', phone: '+91 98350 10016', badgeNumber: 'SD-17' },
    ]
  });
  await prisma.user.create({
    data: { passwordHash: pw, ...at(d2, 'B'), email: 'vikas.pending@minesafe.gov', name: 'Vikas Yadav', role: 'WORKER', trade: 'BLASTER', phone: '+91 98350 10099', badgeNumber: 'W-4188', status: 'PENDING' }
  });

  const [korbaA, korbaB] = korba.districts;
  await prisma.user.createMany({
    data: [
      { ...approved, email: 'korba.worker@minesafe.gov', name: 'Deepak Sahu', role: 'WORKER', trade: 'FITTER', phone: '+91 98350 20001', badgeNumber: 'W-7702', mineId: korba.id, districtId: korbaA.id, shift: 'A' },
      { ...approved, email: 'korba.sirdar@minesafe.gov', name: 'Anil Patel', role: 'SIRDAR', phone: '+91 98350 20002', badgeNumber: 'SD-31', mineId: korba.id, districtId: korbaB.id, shift: 'A' },
    ]
  });

  const mohan = await prisma.user.create({
    data: { ...approved, ...at(d1, 'A'), email: 'sirdar@minesafe.gov', name: 'Mohan Das', role: 'SIRDAR', phone: '+91 98350 10010', badgeNumber: 'SD-12' }
  });
  const suresh = await prisma.user.create({
    data: { ...approved, ...at(d2, 'A'), email: 'suresh.sirdar@minesafe.gov', name: 'Suresh Mahato', role: 'SIRDAR', phone: '+91 98350 10011', badgeNumber: 'SD-14' }
  });
  const overman = await prisma.user.create({
    data: { ...approved, mineId: dhanbad.id, shift: 'A', email: 'overman@minesafe.gov', name: 'Meena Kumari', role: 'OVERMAN', phone: '+91 98350 10015', badgeNumber: 'OM-04' }
  });
  const safetyOfficer = await prisma.user.create({
    data: { ...approved, email: 'safety@minesafe.gov', name: 'Priya Sharma', role: 'OFFICER', officerType: 'SAFETY', phone: '+91 98350 10020', badgeNumber: 'SO-104', mineId: dhanbad.id, department: 'Mine Safety Cell', points: 210 }
  });
  await prisma.user.create({
    data: { ...approved, email: 'ventilation@minesafe.gov', name: 'Imran Khan', role: 'OFFICER', officerType: 'VENTILATION', phone: '+91 98350 10021', badgeNumber: 'VO-22', mineId: dhanbad.id }
  });
  await prisma.user.create({
    data: { ...approved, email: 'asst.manager@minesafe.gov', name: 'Anand Mishra', role: 'ASSISTANT_MANAGER', phone: '+91 98350 10025', badgeNumber: 'AM-03', mineId: dhanbad.id }
  });
  const mineManager = await prisma.user.create({
    data: { ...approved, email: 'manager@minesafe.gov', name: 'Rajesh Verma', role: 'MINE_MANAGER', phone: '+91 98350 10030', badgeNumber: 'MM-01', mineId: dhanbad.id }
  });
  await prisma.user.create({
    data: { ...approved, email: 'owner@minesafe.gov', name: 'Kavita Rao', role: 'OWNER', phone: '+91 98350 10040', badgeNumber: 'AG-05', mineId: dhanbad.id, department: 'Area General Manager' }
  });
  const regulator = await prisma.user.create({
    data: { ...approved, email: 'dgms@minesafe.gov', name: 'Dr. Vikramaditya Singh', role: 'DGMS', phone: '+91 98350 10050', badgeNumber: 'DGMS-NZ-402', department: 'Directorate General of Mines Safety' }
  });
  await prisma.user.create({
    data: { ...approved, email: 'admin@minesafe.gov', name: 'System Admin', isAdmin: true }
  });

  // Attendance: the last 7 days at Dhanbad, with a few people absent each day (today Arjun and Imran are out).
  // Only day-shift (A) people and staff without a shift; today District 2's crew waits for Suresh's pre-shift report.
  const dhanbadStaff = await prisma.user.findMany({
    where: { mineId: dhanbad.id, status: 'APPROVED', OR: [{ shift: 'A' }, { shift: null }] },
    orderBy: { email: 'asc' },
  });
  const absentToday = new Set([
    'arjun.operator@minesafe.gov',
    'rafiq.loader@minesafe.gov',
    'dinesh.contract@minesafe.gov',
    'manoj.contract@minesafe.gov',
    'suresh.sirdar@minesafe.gov',
    'ventilation@minesafe.gov',
    'owner@minesafe.gov',
  ]);
  const todayA = shiftDate('A');
  const attendanceRows = [];
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const date = indiaDate(new Date(new Date(`${todayA}T12:00:00+05:30`).getTime() - daysAgo * 86400000));
    for (const [i, person] of dhanbadStaff.entries()) {
      const absent = daysAgo === 0 ? absentToday.has(person.email) : (i + daysAgo) % 5 === 0;
      if (absent) continue;
      const checkInAt = new Date(`${date}T06:${String(40 + ((i * 7 + daysAgo) % 20)).padStart(2, '0')}:00+05:30`);
      if (checkInAt > new Date()) continue;
      const offset = 0.001 * ((i % 5) - 2); // up to ~220 m from the pin, inside the 1.2 km radius
      attendanceRows.push({
        userId: person.id,
        mineId: dhanbad.id,
        date,
        checkInAt,
        checkInLat: dhanbad.latitude! + offset,
        checkInLng: dhanbad.longitude! - offset,
        checkInAccuracy: 12 + (i % 4) * 6,
        checkInDistance: Math.round(Math.abs(offset) * 111000 * Math.SQRT2),
        checkOutAt: daysAgo > 0 ? new Date(checkInAt.getTime() + 8.5 * 3600000) : null,
        syncedLate: i === 1 && daysAgo === 2,
      });
    }
  }
  await prisma.attendance.createMany({ data: attendanceRows });

  // 3. Badges for Worker
  await prisma.userBadge.createMany({
    data: [
      { userId: worker.id, badgeCode: 'HAZARD_HUNTER', title: 'Hazard Hunter', icon: '🛡️', description: 'Reported 5+ verified early-stage physical safety hazards' },
      { userId: worker.id, badgeCode: 'EARLY_RISK_REPORTER', title: 'Early Risk Reporter', icon: '🚨', description: 'Prevented secondary machinery damage through rapid reporting' },
      { userId: worker.id, badgeCode: 'SAFETY_CHAMPION', title: 'Safety Champion', icon: '🏆', description: 'Awarded for zero safety violations across 6 consecutive months' }
    ]
  });

  // 4. Recognition points
  await prisma.recognitionPoint.createMany({
    data: [
      { userId: worker.id, pointsAwarded: 20, reason: 'Early identification of damaged cable armor in Shaft 2', verifiedBy: 'Priya Sharma (SO)' },
      { userId: worker.id, pointsAwarded: 15, reason: 'Useful safety suggestion on water misting near haulage transfer point', verifiedBy: 'Rajesh Verma (MM)' },
      { userId: worker.id, pointsAwarded: 40, reason: 'Completed 12 weekly pre-shift safety checklists with 100% precision', verifiedBy: 'Priya Sharma (SO)' },
    ]
  });

  // 5. Safety Reports (including required demo scenario SAFE-2026-00124)
  const report1 = await prisma.safetyReport.create({
    data: {
      id: 'SAFE-2026-00124',
      reporterId: worker.id,
      mineId: dhanbad.id,
      districtId: d1.id,
      category: 'PPE',
      severity: 'HIGH',
      description: 'Multiple self-contained self-rescuer (SCSR) respirators stored in Box 4 had cracked oxygen seals and degraded face masks, exposing extraction crew to asphyxiation risk in case of smoke.',
      immediateActionTaken: 'Flagged box with red warning tag and notified shift mate to withdraw replacement units from refuge chamber.',
      imageUrl: 'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=600&q=80',
      status: 'ASSIGNED',
      assignedOfficer: 'Priya Sharma (Lead SO)',
      rewardPointsAwarded: true,
    }
  });

  const report2 = await prisma.safetyReport.create({
    data: {
      id: 'SAFE-2026-00129',
      reporterId: worker.id,
      mineId: dhanbad.id,
      districtId: d2.id,
      category: 'MACHINERY',
      severity: 'MEDIUM',
      description: 'Conveyor 3 idler roller bearing overheating to 85°C. Excessive friction sparks observed during full coal haulage cycle.',
      immediateActionTaken: 'Applied grease lubricator temporarily and requested belt speed reduction to 1.8 m/s.',
      status: 'SUBMITTED',
      assignedOfficer: 'Priya Sharma',
      rewardPointsAwarded: false,
    }
  });

  const report3 = await prisma.safetyReport.create({
    data: {
      id: 'SAFE-2026-00108',
      reporterId: null, // anonymous
      mineId: eastern.id,
      districtId: eastern.districts[1].id, // North District
      category: 'VENTILATION',
      severity: 'CRITICAL',
      description: 'Secondary brattice cloth curtain torn near face return airway. Airflow velocity dropped below statutory 0.5 m/s threshold.',
      immediateActionTaken: 'Halted extraction equipment until auxiliary exhaust fan reinstated.',
      status: 'RESOLVED',
      assignedOfficer: 'Amit Sen (SO)',
      rewardPointsAwarded: true,
    }
  });

  // 6. Grievances (including demo scenario GRV-2026-8F4A21)
  const grievance1 = await prisma.grievance.create({
    data: {
      id: 'GRV-2026-8F4A21',
      trackingCode: 'GRV-2026-8F4A21',
      anonymityType: 'ANONYMOUS',
      submitterId: null, // Identity strictly preserved/hidden
      mineId: dhanbad.id,
      category: 'SUPERVISOR_PRESSURE',
      description: 'Shift Sirdar pressured team of 8 miners to continue cutting coal despite methane sensor flashing 1.2% CH4 alarm and inadequate water spray. Threat of wage deduction made if daily tonnage not met.',
      status: 'INVESTIGATION_IN_PROGRESS',
      escalationTier: 'MINE_MANAGEMENT',
      timeline: JSON.stringify([
        { step: 'SUBMITTED', time: new Date(Date.now() - 86400000 * 3).toISOString(), note: 'Anonymous submission received via cryptographic gateway' },
        { step: 'UNDER_REVIEW', time: new Date(Date.now() - 86400000 * 2).toISOString(), note: 'Validated by Mine Safety Officer; escalated due to severe coercion risk' },
        { step: 'INVESTIGATION_IN_PROGRESS', time: new Date(Date.now() - 86400000 * 1).toISOString(), note: 'Independent inquiry officer assigned; shift Sirdar requested for formal deposition' }
      ]),
    }
  });

  const grievance2 = await prisma.grievance.create({
    data: {
      id: 'GRV-2026-C92B15',
      trackingCode: 'GRV-2026-C92B15',
      anonymityType: 'CONFIDENTIAL',
      submitterId: worker.id,
      mineId: dhanbad.id,
      category: 'EQUIPMENT_SAFETY',
      description: 'Roof bolter hydraulic hoses leaking high pressure fluid near operator control cabin without safety sleeving.',
      status: 'ACTION_REQUIRED',
      escalationTier: 'MINE_OFFICER',
      timeline: JSON.stringify([
        { step: 'SUBMITTED', time: new Date(Date.now() - 86400000 * 4).toISOString(), note: 'Confidential report submitted with equipment serial #RB-09' },
        { step: 'ASSIGNED', time: new Date(Date.now() - 86400000 * 2).toISOString(), note: 'Mechanical engineering superintendent assigned for sleeve replacement' }
      ]),
    }
  });

  // 7. SOS Alerts (including demo scenario SOS-2026-90412)
  await prisma.sosAlert.create({
    data: {
      id: 'SOS-2026-90412',
      workerIdentifier: 'Ramesh Kumar (W-4109)',
      triggeredById: worker.id,
      mineId: dhanbad.id,
      districtId: d1.id,
      emergencyType: 'ACCIDENT',
      status: 'ACKNOWLEDGED',
      assignedTeams: 'Rescue Team Bravo, Underground First Aid Squad 2',
      responderNotes: 'Safety officer acknowledged alert within 42 seconds. Medical paramedic equipped with oxygen stretcher descending via Shaft 2.',
      triggeredAt: new Date(Date.now() - 1000 * 60 * 14), // 14 mins ago
    }
  });

  await prisma.sosAlert.create({
    data: {
      id: 'SOS-2026-88102',
      workerIdentifier: 'ANON-TOKEN-77',
      mineId: eastern.id,
      districtId: eastern.districts[2].id, // South District
      emergencyType: 'GAS_HAZARD',
      status: 'RESOLVED',
      assignedTeams: 'Ventilation Strike Team Alpha',
      responderNotes: 'Auxiliary vent duct repaired, CH4 evacuated below 0.3%. All crew safely sheltered in refuge station.',
      triggeredAt: new Date(Date.now() - 86400000 * 1.5),
      resolvedAt: new Date(Date.now() - 86400000 * 1.2),
    }
  });

  // 8. Inspections (including INS-2026-00071)
  const inspection1 = await prisma.inspection.create({
    data: {
      id: 'INS-2026-00071',
      mineId: dhanbad.id,
      inspectorName: 'Dr. Vikramaditya Singh (DGMS)',
      inspectionType: 'STATUTORY_QUARTERLY',
      checklistData: JSON.stringify([
        { item: 'Main Mechanical Fan static pressure gauge calibrated', passed: true },
        { item: 'Flameproof enclosure seals intact on 3.3kV switchgear', passed: true },
        { item: 'Stone dust barrier quantity per cubic meter compliance', passed: false, note: 'Barrier #4 requires replenishment within 48h' },
        { item: 'Self-rescuer availability 120% of maximum underground shift', passed: true },
        { item: 'Emergency telephone line continuity to surface control', passed: true }
      ]),
      findings: 'Overall ventilation and gas monitoring instrumentation adheres to DGMS Coal Mines Regulations 2017. Minor stone dust deficiency noted in Return Airway 4.',
      violationsCount: 1,
      deadline: new Date(Date.now() + 86400000 * 14),
      status: 'COMPLETED',
      completedAt: new Date(Date.now() - 86400000 * 2),
    }
  });

  // 8b. Assigned inspections: one due, one waiting for approval, one sent back, one overdue at Korba
  const arjun = await prisma.user.findUniqueOrThrow({ where: { email: 'arjun.operator@minesafe.gov' } });
  const imran = await prisma.user.findUniqueOrThrow({ where: { email: 'ventilation@minesafe.gov' } });
  const anil = await prisma.user.findUniqueOrThrow({ where: { email: 'korba.sirdar@minesafe.gov' } });
  const admin = { assignedByName: 'System Admin', checklistData: '[]', findings: '' };
  await prisma.inspection.createMany({
    data: [
      {
        ...admin, id: 'INS-2026-00102', mineId: dhanbad.id, inspectionType: 'ROOF_SUPPORT_CHECK', title: 'Roof bolts, District 1',
        inspectorName: mohan.name, assignedToId: mohan.id, deadline: new Date(Date.now() + 86400000), status: 'SCHEDULED',
      },
      {
        ...admin, id: 'INS-2026-00098', mineId: dhanbad.id, inspectionType: 'VENTILATION_AUDIT', title: 'Main fan pressure log',
        inspectorName: imran.name, assignedToId: imran.id, deadline: new Date(Date.now() - 3600000 * 6), status: 'SUBMITTED',
        outcome: 'NOT_DONE', submissionNote: 'Fan house was locked. The key is with the electrical department until tomorrow.',
        findings: 'Fan house was locked.', submittedAt: new Date(Date.now() - 3600000 * 2),
      },
      {
        ...admin, id: 'INS-2026-00095', mineId: dhanbad.id, inspectionType: 'MACHINERY_CHECK', title: 'Conveyor 3 belt guards',
        inspectorName: arjun.name, assignedToId: arjun.id, deadline: new Date(Date.now() + 86400000 * 2), status: 'RETURNED',
        outcome: 'DONE', submittedAt: new Date(Date.now() - 86400000), reviewedById: mohan.id, reviewedByName: mohan.name,
        reviewedAt: new Date(Date.now() - 3600000 * 20), reviewNote: 'Photo does not show the tail-end guard. Retake it from the walkway.',
      },
      {
        ...admin, id: 'INS-2026-00090', mineId: korba.id, inspectionType: 'FIRE_SAFETY', title: 'Extinguishers at pit bottom',
        inspectorName: anil.name, assignedToId: anil.id, deadline: new Date(Date.now() - 86400000 * 2), status: 'SCHEDULED',
      },
    ],
  });

  // 9. Corrective Actions (including ACT-2026-00042)
  await prisma.correctiveAction.create({
    data: {
      id: 'ACT-2026-00042',
      issueId: 'SAFE-2026-00124',
      issueType: 'SAFETY_REPORT',
      actionRequired: 'Replace all 18 defective SCSR respirators in Box 4, District 1 and perform leak-decay calibration test on all refuge stations.',
      responsiblePerson: 'Manish Tiwari (Safety Equipment Custodian)',
      deadline: new Date(Date.now() + 86400000 * 3),
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      evidence: 'Procurement requisition #PR-9920 approved for immediate warehouse dispatch of Draeger Oxybok units.',
    }
  });

  await prisma.correctiveAction.create({
    data: {
      id: 'ACT-2026-00039',
      issueId: 'INS-2026-00071',
      issueType: 'INSPECTION',
      actionRequired: 'Replenish incombustible stone dust barrier in Return Airway 4 to maintain minimum 75% incombustible matter ratio.',
      responsiblePerson: 'Sunil Rao (Underground Safety Foreman)',
      deadline: new Date(Date.now() + 86400000 * 2),
      priority: 'CRITICAL',
      status: 'PENDING',
    }
  });

  // 10. Incidents
  await prisma.incident.create({
    data: {
      id: 'INC-2026-00015',
      incidentType: 'METHANE_SPIKE',
      mineId: dhanbad.id,
      location: 'District 1, Longwall Face 4',
      severity: 'SERIOUS',
      description: 'Transient localized methane gas concentration spiked to 1.8% during shearer pass near upper tailgate corner due to roof break.',
      peopleAffected: 0,
      immediateResponse: 'Automated electric interlock tripped power to shearer. Auxiliary booster duct deployed within 4 minutes.',
      rootCause: 'Geological fault fissure release combined with temporary brattice flutter.',
      correctiveActionId: 'ACT-2026-00042',
      reportedById: mohan.id,
      reportedByName: mohan.name,
      status: 'CONTAINED',
      createdAt: new Date(Date.now() - 86400000 * 5),
    }
  });

  await prisma.incident.create({
    data: {
      id: 'INC-2026-00019',
      incidentType: 'MINOR_INJURY',
      mineId: dhanbad.id,
      location: 'District 2, near conveyor 3',
      severity: 'MINOR',
      description: 'Contract worker cut his hand on a roof bolt plate while unloading supports. No gloves were being worn.',
      peopleAffected: 1,
      immediateResponse: 'First aid at the pit bottom; returned to the surface.',
      contractId: 'CON-2026-00012',
      reportedById: suresh.id,
      reportedByName: suresh.name,
      status: 'INVESTIGATING',
      createdAt: new Date(Date.now() - 86400000 * 3),
    }
  });

  // 10b. Escalations: the live SOS went to the safety officer (acknowledged); the methane spike waits on the manager.
  await prisma.escalation.createMany({
    data: [
      {
        recordType: 'SOS', recordId: 'SOS-2026-90412', mineId: dhanbad.id, summary: `SOS: Accident · ${d1.name}`, severe: true,
        fromUserId: mohan.id, toRole: 'OFFICER', toOfficerType: 'SAFETY', reason: 'Worker trapped by fallen roof bolt plate, needs rescue team.',
        recipientCount: 1, callStatus: 'NOT_CONFIGURED', status: 'ACKNOWLEDGED', acknowledgedById: safetyOfficer.id,
        acknowledgedByName: safetyOfficer.name, acknowledgedAt: new Date(Date.now() - 1000 * 60 * 12), createdAt: new Date(Date.now() - 1000 * 60 * 13),
      },
      {
        recordType: 'INCIDENT', recordId: 'INC-2026-00015', mineId: dhanbad.id, summary: 'Methane spike · District 1, Longwall Face 4', severe: false,
        fromUserId: mohan.id, toRole: 'MINE_MANAGER', reason: 'Second methane spike this month at the same tailgate. Needs a ventilation review.',
        recipientCount: 1, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
      },
    ],
  });

  // 10c. Pre-shift inspections for Dhanbad. Last night's Sirdar in District 1 left a handover about gallery 14;
  // this morning Mohan cleared District 1 with gallery 14 fenced off and later bolted it (waiting for a check);
  // Lakshmi pulled District 3 out for gas mid-shift and cleared it again. District 2 still waits for Suresh,
  // so Arjun and Rafiq cannot check in until he submits.
  const ramu = await prisma.user.findUniqueOrThrow({ where: { email: 'ramu.sirdar@minesafe.gov' } });
  const lakshmi = await prisma.user.findUniqueOrThrow({ where: { email: 'lakshmi.sirdar@minesafe.gov' } });
  /** Today's shift-A time, or a moment ago if that time hasn't come yet. */
  const past = (hhmm: string, fallbackMinutesAgo: number) => {
    const t = new Date(`${todayA}T${hhmm}:00+05:30`);
    return t < new Date() ? t : new Date(Date.now() - fallbackMinutesAgo * 60000);
  };
  const ok = { ok: true, note: null };
  const lastNight = previousShift('A', todayA);
  await prisma.shiftReport.create({
    data: {
      mineId: dhanbad.id, districtId: d1.id, date: lastNight.date, shift: 'C', sirdarId: ramu.id, status: 'SAFE',
      checks: JSON.stringify({ GAS: ok, ROOF: ok, VENTILATION: ok, EQUIPMENT: ok }), methanePct: 0.2,
      submittedAt: new Date(`${lastNight.date}T21:40:00+05:30`),
      handoverNote: 'Roof in gallery 14 started cracking near the junction around 4 AM. Fenced it off. Support crew needs to bolt it in the first shift.',
      handoverAt: past('05:50', 50),
    },
  });
  const d1Report = await prisma.shiftReport.create({
    data: {
      mineId: dhanbad.id, districtId: d1.id, date: todayA, shift: 'A', sirdarId: mohan.id, status: 'RESTRICTED',
      checks: JSON.stringify({ GAS: ok, ROOF: { ok: false, note: 'Cracks in the gallery 14 roof near the junction' }, VENTILATION: ok, EQUIPMENT: ok }),
      methanePct: 0.3, restrictions: 'Gallery 14 fenced off until the roof is bolted.',
      submittedAt: past('05:40', 45),
    },
  });
  const seenAt = past('08:10', 20);
  if (seenAt > d1Report.submittedAt) {
    await prisma.shiftReport.update({
      where: { id: d1Report.id },
      data: { seenById: overman.id, seenByName: overman.name, seenAt, seenNote: 'Support crew sent to bolt gallery 14.' },
    });
  }
  const gasOut = past('11:30', 15);
  const gasBack = past('12:30', 5);
  await prisma.shiftReport.create({
    data: {
      mineId: dhanbad.id, districtId: d3.id, date: todayA, shift: 'A', sirdarId: lakshmi.id, status: 'SAFE',
      checks: JSON.stringify({ GAS: ok, ROOF: ok, VENTILATION: ok, EQUIPMENT: ok }), methanePct: 0.4,
      submittedAt: past('05:45', 40),
      history: JSON.stringify([
        { at: gasOut.toISOString(), by: lakshmi.name, from: 'SAFE', status: 'UNSAFE', note: 'Methane above the limit at face 3. Everyone withdrawn to fresh air.' },
        { at: gasBack.toISOString(), by: lakshmi.name, from: 'UNSAFE', status: 'SAFE', note: 'Ventilation officer adjusted the airflow. Re-checked, gas back to normal.' },
      ]),
    },
  });

  // A hazard Mohan says is fixed, waiting for someone above him to confirm or send an inspection.
  await prisma.safetyReport.create({
    data: {
      id: 'SAFE-2026-00131',
      reporterId: mohan.id,
      mineId: dhanbad.id,
      districtId: d1.id,
      category: 'STRUCTURAL',
      severity: 'HIGH',
      description: 'Roof cracked in gallery 14 near the junction. Loose pieces falling.',
      immediateActionTaken: 'Fenced off with a DANGER board before the shift.',
      status: 'FIXED',
      assignedOfficer: mohan.name,
      fixedById: mohan.id,
      fixedByName: mohan.name,
      fixedAt: past('10:30', 10),
      fixNote: 'Support crew put in 4 roof bolts and a W-strap at the junction. Fence stays until someone checks it.',
      createdAt: past('05:40', 45),
    },
  });

  // 10d. Specialists and their reports. The blast report is the paper form used at an opencast OB bench.
  const obContract = await prisma.contract.findUniqueOrThrow({ where: { id: 'CON-2026-00004' } });
  const blaster = await prisma.user.create({
    data: {
      ...approved, email: 'blaster@minesafe.gov', name: 'Bijay Kumar', role: 'SPECIALIST', specialistType: 'BLASTER', phone: '+91 98350 40001',
      badgeNumber: 'SE-B07', mineId: singrauli.id, contractId: obContract.id, trainingValidUntil: new Date(Date.now() + 300 * DAY),
    },
  });
  await prisma.user.create({
    data: { ...approved, email: 'singrauli.manager@minesafe.gov', name: 'Alok Tripathi', role: 'MINE_MANAGER', phone: '+91 98350 40002', badgeNumber: 'MM-09', mineId: singrauli.id },
  });
  const shotFirer = await prisma.user.create({
    data: { ...approved, email: 'shotfirer@minesafe.gov', name: 'Nitesh Rawani', role: 'SPECIALIST', specialistType: 'SHOT_FIRER', phone: '+91 98350 10017', badgeNumber: 'SF-03', mineId: dhanbad.id },
  });
  const yesterday = indiaDate(new Date(Date.now() - DAY));
  const blastRows: [string, string][] = [
    ['Date of blast', yesterday], ['Quarry', 'SEB'], ['Location', 'VII OB'], ['Face', 'VII OB'], ['Distance from nearest structure (m)', '450'],
    ['Hole diameter (mm)', '165'], ['Face condition', 'Hard'], ['Bench height (m)', '5.0'], ['Hole depth (m)', '5.2'], ['No. of holes', '20'],
    ['Burden (m)', '4.0'], ['Spacing (m)', '5.0'], ['Avg. charge (kg)', '50'], ['Total charge (kg)', '1000'], ['No. of rounds', '1'],
    ['Avg. bottom charge length (m)', '—'], ['Avg. decking (m)', '—'], ['Avg. top charge length (m)', '—'], ['Avg. stemming (m)', '3.0'],
    ['Overburden (cu.m)', '2000'], ['Coal (t)', '—'], ['Powder factor (cu.m/kg)', '2.0'], ['Fragmentation', 'Good'], ['Throw (m)', 'Normal'],
    ['Fly rock (m)', 'NIL'], ['Muck pile profile', 'Heave'], ['Vibration PPV (mm/s)', '4.256'], ['Noise (dB)', '125'],
    ['Distance of minimate from face (m)', '150'], ['Location of minimate', 'Haul road'], ['Max. charge per delay (kg)', '60'],
    ['Max. charge per round (kg)', '1006.25'], ['Booster', ''],
  ];
  await prisma.fieldReport.create({
    data: {
      id: 'RPT-2026-00031', mineId: singrauli.id, districtId: singrauli.districts[1].id, authorId: blaster.id, reportType: 'BLAST',
      title: 'Blast report, VII OB bench', workDate: yesterday,
      body: 'Single round, 20 holes. No misfires. All holes fired. Guards withdrawn at 14:20 after the all-clear.',
      tableData: JSON.stringify({ columns: ['Parameter', 'Value'], rows: blastRows }),
    },
  });
  await prisma.fieldReport.create({
    data: {
      id: 'RPT-2026-00029', mineId: dhanbad.id, districtId: d1.id, authorId: shotFirer.id, reportType: 'BLAST',
      title: 'Shot-firing record, District 1 face 3', workDate: yesterday,
      body: 'Gas tested before charging and after firing: 0.2%. 12 shots fired, 1 misfire in hole 7, marked and handed over to the next shift.',
      tableData: JSON.stringify({
        columns: ['Item', 'Issued', 'Used', 'Returned'],
        rows: [['Explosive (kg)', '14', '12.5', '1.5'], ['Detonators', '12', '11', '1']],
      }),
      status: 'REVIEWED', reviewedByName: overman.name, reviewedAt: new Date(Date.now() - DAY / 2),
      reviewNote: 'Misfire hole 7 to be dealt with by the next shot-firer before any drilling.',
    },
  });

  // 11. Announcements
  await prisma.announcement.createMany({
    data: [
      {
        mineId: dhanbad.id,
        title: 'Mandatory Quarterly Self-Rescuer Refresher Training',
        content: 'All underground crew members must attend the 45-minute practical donning test at the Safety Center before commencing Friday shifts.',
        priority: 'HIGH'
      },
      {
        mineId: dhanbad.id,
        title: 'DGMS High Monsoon Precautions Circular Issued',
        content: 'Surface water drainage pumps and underground sump levels are operating under Level-2 alert monitoring protocol.',
        priority: 'NORMAL'
      }
    ]
  });

  // 12. Build Tamper-Evident SHA-256 Audit Chain
  console.log('Generating initial cryptographic SHA-256 audit blocks...');

  await AuditService.recordEvent({
    recordType: 'SAFETY_REPORT',
    recordId: report1.id,
    action: 'CREATED',
    performedByRole: 'WORKER',
    data: {
      id: report1.id,
      category: report1.category,
      severity: report1.severity,
      mine: dhanbad.name,
      description: report1.description,
      reportedAt: report1.createdAt
    }
  });

  await AuditService.recordEvent({
    recordType: 'SAFETY_REPORT',
    recordId: report1.id,
    action: 'STATUS_CHANGED',
    performedByRole: 'OFFICER',
    data: {
      id: report1.id,
      status: 'ASSIGNED',
      assignedOfficer: 'Priya Sharma',
      actionPlan: 'Created Corrective Action ACT-2026-00042'
    }
  });

  await AuditService.recordEvent({
    recordType: 'GRIEVANCE',
    recordId: grievance1.id,
    action: 'CREATED',
    performedByRole: 'ANONYMOUS_WORKER',
    data: {
      id: grievance1.id,
      trackingCode: grievance1.trackingCode,
      category: grievance1.category,
      anonymity: 'PRESERVED_TIER_1',
      mineCode: dhanbad.code
    }
  });

  await AuditService.recordEvent({
    recordType: 'GRIEVANCE',
    recordId: grievance1.id,
    action: 'ESCALATED',
    performedByRole: 'OFFICER',
    data: {
      id: grievance1.id,
      escalatedFrom: 'MINE_OFFICER',
      escalatedTo: 'MINE_MANAGEMENT',
      reason: 'Sirdar coercion substantiated'
    }
  });

  await AuditService.recordEvent({
    recordType: 'INSPECTION',
    recordId: inspection1.id,
    action: 'CREATED',
    performedByRole: 'DGMS',
    data: {
      id: inspection1.id,
      mine: dhanbad.name,
      inspector: inspection1.inspectorName,
      type: inspection1.inspectionType,
      violations: 1
    }
  });

  await AuditService.recordEvent({
    recordType: 'INSPECTION',
    recordId: inspection1.id,
    action: 'VERIFIED',
    performedByRole: 'DGMS',
    data: {
      id: inspection1.id,
      verificationStatus: 'DGMS_SEALED',
      integrityCheckPassed: true
    }
  });

  console.log('Database seeded successfully with demo scenarios and cryptographic chain!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
