const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const MasterSheetWorkbookService = require("../services/MasterSheetWorkbookService");

const subjects = [
  ["filipino", "FIL", "Filipino"],
  ["english", "ENG", "English"],
  ["mathematics", "MATH", "Mathematics"],
  ["science", "SCI", "Science"],
  ["ap", "AP", "AP"],
  ["tle", "TLE", "TLE"],
  ["mapeh", "MAPEH", "MAPEH"],
  ["esp", "ESP", "ESP"],
].map(([key, code, label]) => ({ key, code, label, available: true }));

test("generates the three-term DepEd-aligned workbook in memory", async () => {
  const grades = Object.fromEntries(subjects.map((subject) => [
    subject.key,
    { terms: [88, 89, 90], finalGrade: 89 },
  ]));
  const data = {
    school: {
      name: "GCCNHS",
      code: "304130",
      region: "10",
      division: "Gingoog",
    },
    schoolYear: { label: "2026-2027" },
    section: { gradeLevel: "Grade 7", name: "Mahogany" },
    adviser: { name: "Harvey Babia" },
    subjects,
    students: [{
      studentSectionId: 1,
      displayName: "Santos, Juan D.",
      sex: "M",
      grades,
      generalAverage: 89,
    }],
  };

  const { buffer, filename } = await MasterSheetWorkbookService.generate(data);
  assert.ok(buffer.length > 10000);
  assert.equal(filename, "Master_Sheet_Grade_7_Mahogany_SY_2026-2027.xlsx");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.equal(workbook.worksheets.length, 1);
  const worksheet = workbook.getWorksheet("SUMMARY - FINAL GRADES");
  assert.ok(worksheet);
  assert.equal(worksheet.pageSetup.orientation, "landscape");
  assert.equal(worksheet.getCell("A1").value, "FINAL GRADES AND GENERAL AVERAGE");
  assert.equal(worksheet.getCell("I3").value, "X");
  assert.equal(worksheet.getCell("D3").alignment.horizontal, "right");
  assert.equal(worksheet.getCell("P3").value, "DIVISION");
  assert.equal(worksheet.getCell("T3").value, "Gingoog");
  assert.equal(worksheet.getCell("P5").value, "SCHOOL ID");
  assert.equal(worksheet.getCell("T5").value, "304130");
  assert.equal(worksheet.getCell("I3").font.size, 11);
  assert.equal(worksheet.getCell("F7").font.size, 11);
  assert.equal(worksheet.getCell("Z3").value, "SCHOOL YEAR");
  assert.equal(worksheet.getCell("Y5").value, "GRADE & SECTION");
  assert.equal(worksheet.getCell("A7").value, "ADVISER: Harvey Babia");
  assert.equal(worksheet.getCell("A8").value, "NAMES OF LEARNERS");
  assert.equal(worksheet.getCell("A10").value, "");
  assert.equal(worksheet.getCell("B10").value, "MALE");
  assert.equal(worksheet.getCell("C10").master.address, "B10");
  assert.equal(worksheet.getCell("E10").master.address, "B10");
  assert.equal(worksheet.getCell("A11").value, 1);
  assert.equal(worksheet.getCell("I11").value.result, 89);
  assert.equal(worksheet.autoFilter, undefined);
  assert.equal(worksheet.views[0].state, "normal");
  assert.ok(!worksheet.views[0].xSplit);
  assert.ok(!worksheet.views[0].ySplit);
  assert.equal(worksheet.getCell("B11").font.name, "Arial");
  assert.equal(worksheet.getCell("F11").border.left.style, "medium");
  assert.equal(worksheet.getCell("I11").border.right.style, "medium");
  assert.equal(worksheet.getCell("J11").border.left.style, "medium");
  assert.equal(worksheet.getCell("I11").border.right.color.argb, "595959");
  assert.equal(worksheet.getCell("A7").border.left.style, "medium");
  assert.equal(worksheet.getCell("E7").border.right.style, "medium");
  assert.equal(worksheet.getCell("A10").border.top.style, "medium");
  assert.equal(worksheet.getCell("AM10").border.bottom.style, "medium");
  assert.equal(worksheet.getCell("A12").border.bottom.style, "medium");
  assert.equal(worksheet.getCell("AM12").border.right.style, "medium");
  assert.equal(worksheet.getCell("AM7").font.size, 9);
  assert.equal(worksheet.getColumn(6).width, 3.8);
  assert.equal(worksheet.getColumn(9).width, 7.5);
  assert.match(worksheet.pageSetup.printArea, /^A1:AM/);
});
