import pool from './config/db.js';

const SEED_STUDENTS = [
  { lrn: '100000000001', last_name: 'Abad', first_name: 'Juan', sex: 'M' },
  { lrn: '100000000002', last_name: 'Alcantara', first_name: 'Pedro', sex: 'M' },
  { lrn: '100000000003', last_name: 'Aquino', first_name: 'Benigno', sex: 'M' },
  { lrn: '100000000004', last_name: 'Bautista', first_name: 'Jose', sex: 'M' },
  { lrn: '100000000005', last_name: 'Bonifacio', first_name: 'Andres', sex: 'M' },
  { lrn: '100000000006', last_name: 'Cruz', first_name: 'Juan Dela', sex: 'M' },
  { lrn: '100000000007', last_name: 'Dela Cruz', first_name: 'Emilio', sex: 'M' },
  { lrn: '100000000008', last_name: 'Del Pilar', first_name: 'Marcelo', sex: 'M' },
  { lrn: '100000000009', last_name: 'Estrada', first_name: 'Joseph', sex: 'M' },
  { lrn: '100000000010', last_name: 'Garcia', first_name: 'Carlos', sex: 'M' },
  { lrn: '100000000011', last_name: 'Magsaysay', first_name: 'Ramon', sex: 'M' },
  { lrn: '100000000012', last_name: 'Marcos', first_name: 'Ferdinand', sex: 'M' },
  { lrn: '100000000013', last_name: 'Osmeña', first_name: 'Sergio', sex: 'M' },
  { lrn: '100000000014', last_name: 'Quezon', first_name: 'Manuel', sex: 'M' },
  { lrn: '100000000015', last_name: 'Rizal', first_name: 'Jose', sex: 'M' },
  { lrn: '100000000016', last_name: 'Santos', first_name: 'Maria', sex: 'F' },
  { lrn: '100000000017', last_name: 'Silang', first_name: 'Gabriela', sex: 'F' },
  { lrn: '100000000018', last_name: 'Tecson', first_name: 'Trinidad', sex: 'F' },
  { lrn: '100000000019', last_name: 'Aquino', first_name: 'Corazon', sex: 'F' },
  { lrn: '100000000020', last_name: 'Arroyo', first_name: 'Gloria', sex: 'F' },
];

async function seedStudents() {
  const conn = await pool.getConnection();

try {
  console.log('Seeding students...');

  const [sections] = await conn.query('SELECT section_id FROM SECTION LIMIT 5');
  if (sections.length === 0) {
    console.error('No sections found. Please seed sections first.');
    return;
  }

  const sectionIds = sections.map((s) => s.section_id);

  // DISABLE CONSTRAINTS -> DELETE OLD DATA -> RE-ENABLE CONSTRAINTS
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  await conn.query('TRUNCATE TABLE STUDENT_SECTION');
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  for (let i = 0; i < SEED_STUDENTS.length; i++) {
    const s = SEED_STUDENTS[i];

    const [existing] = await conn.query('SELECT student_id FROM STUDENT WHERE LRN = ?', [s.lrn]);

    let studentId;

    if (existing.length === 0) {
      const [result] = await conn.query(
        'INSERT INTO STUDENT (LRN, first_name, last_name, sex, status) VALUES (?, ?, ?, ?, ?)',
        [s.lrn, s.first_name, s.last_name, s.sex, 'ACTIVE']
      );
      studentId = result.insertId;
    } else {
      studentId = existing[0].student_id;
    }

    // Assign student to a single section using modulo distribution
    const assignedSectionId = sectionIds[i % sectionIds.length];

    await conn.query(
      'INSERT INTO STUDENT_SECTION (student_id, section_id, school_year_id) VALUES (?, ?, 1)',
      [studentId, assignedSectionId]
    );
  }

  console.log('Students seeded successfully!');
} catch (err) {
  console.error('Error seeding students:', err);
} finally {
  conn.release();
  process.exit();
}
}

seedStudents();