import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

const HTML_ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);

function buildSf9Pages({
  studentProfile = {},
  grades = [],
  performanceDescriptors = [],
  attendanceData = { months: [], classDays: [], daysPresent: [], daysAbsent: [] },
  comments = {},
  depedLogo,
  gccnhsLogo,
}) {
  const getAttendanceTotal = (arr = []) =>
    arr.reduce((acc, curr) => acc + (Number(curr) || 0), 0);

  const defaultDescriptors = [
    { scale: "90-100", desc: "Advancing", remarks: "Passed" },
    { scale: "80-89", desc: "Benchmarking", remarks: "Passed" },
    { scale: "75-79", desc: "Connecting", remarks: "Passed" },
    { scale: "65-74", desc: "Developing", remarks: "Passed" },
    { scale: "0-64", desc: "Emerging", remarks: "Passed" },
  ];
  const descriptorsToUse =
    performanceDescriptors && performanceDescriptors.length > 0
      ? performanceDescriptors
      : defaultDescriptors;

  const months =
    attendanceData.months && attendanceData.months.length > 0
      ? attendanceData.months
      : ["Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];

  const classDays = attendanceData.classDays || new Array(months.length).fill(0);
  const daysPresent = attendanceData.daysPresent || new Array(months.length).fill(0);
  const daysAbsent = attendanceData.daysAbsent || new Array(months.length).fill(0);

  // Front Page (Page 1): US Letter 8.5 x 11 in (816 x 1056 px at 96 DPI), Margin 45 px (33.75 pt)
  const frontHtml = `
    <div style="width: 816px; height: 1056px; padding: 45px; box-sizing: border-box; background: #ffffff; font-family: 'Times New Roman', Times, Georgia, serif; color: #000000; display: flex; flex-direction: column; justify-content: space-between;">
      <div>
        <!-- Institutional Header -->
        <div style="display: grid; grid-template-columns: 74px 1fr 74px; align-items: center; gap: 12px; margin-bottom: 0;">
          <div style="text-align: center;">
            ${
              depedLogo
                ? `<img src="${escapeHtml(depedLogo)}" alt="DepEd Seal" style="width: 74px; height: 74px; object-fit: contain;" />`
                : `<div style="width: 74px; height: 74px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 9px;">DepEd Logo</div>`
            }
          </div>
          <div style="text-align: center; line-height: 14px;">
            <p style="font-size: 11px; margin: 0;">Republic of the Philippines</p>
            <p style="font-size: 11px; margin: 0;">Department of Education</p>
            <p style="font-size: 11px; margin: 0;">Region X – Northern Mindanao</p>
            <p style="font-size: 11px; margin: 0; font-weight: bold;">SCHOOLS DIVISION OFFICE OF GINGOOG CITY</p>
            <p style="font-size: 11px; margin: 0;">West 1 District</p>
            <p style="font-size: 11px; margin: 0;">Gingoog City, Misamis Oriental</p>
            <h3 style="font-size: 12px; font-weight: bold; margin: 4px 0 2px 0; text-transform: uppercase;">GINGOOG CITY COMPREHENSIVE NATIONAL HIGH SCHOOL</h3>
            <h2 style="font-size: 13px; font-weight: bold; margin: 2px 0 2px 0; letter-spacing: 0.4px; text-transform: uppercase;">LEARNER'S PERFORMANCE REPORT</h2>
            <p style="font-size: 11px; margin: 0;">School Year ${escapeHtml(studentProfile.schoolYear || "")}</p>
          </div>
          <div style="text-align: center;">
            ${
              gccnhsLogo
                ? `<img src="${escapeHtml(gccnhsLogo)}" alt="School Seal" style="width: 74px; height: 74px; object-fit: contain;" />`
                : `<div style="width: 74px; height: 74px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 9px;">School Logo</div>`
            }
          </div>
        </div>

        <!-- Learner Information Block (20px top spacing, 22px vertical pitch) -->
        <div style="margin-top: 20px; font-size: 11px;">
          <div style="display: flex; align-items: flex-end; gap: 16px; height: 22px;">
            <div style="display: flex; align-items: flex-end; gap: 6px; flex: 2;">
              <span style="font-size: 11.5px; font-weight: bold; white-space: nowrap;">Name:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; padding: 0 6px; font-size: 11px; text-transform: uppercase;">${escapeHtml(studentProfile.name || "")}</span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 6px; width: 85px;">
              <span style="font-size: 11.5px; font-weight: bold; white-space: nowrap;">Age:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; text-align: center; font-size: 11px;">${escapeHtml(studentProfile.age ?? "")}</span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 6px; width: 100px;">
              <span style="font-size: 11.5px; font-weight: bold; white-space: nowrap;">Sex:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; text-align: center; font-size: 11px;">${escapeHtml(studentProfile.sex || "")}</span>
            </div>
          </div>

          <div style="display: flex; align-items: flex-end; gap: 16px; height: 22px;">
            <div style="display: flex; align-items: flex-end; gap: 6px; flex: 2;">
              <span style="font-size: 11.5px; font-weight: bold; white-space: nowrap;">LRN:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; padding: 0 6px; font-size: 11px;">${escapeHtml(studentProfile.lrn || "")}</span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 6px; width: 90px;">
              <span style="font-size: 11.5px; font-weight: bold; white-space: nowrap;">Grade:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; text-align: center; font-size: 11px;">${escapeHtml(studentProfile.grade || studentProfile.gradeLevel || "")}</span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 6px; flex: 1.2;">
              <span style="font-size: 11.5px; font-weight: bold; white-space: nowrap;">Section:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; text-align: center; font-size: 11px;">${escapeHtml(studentProfile.section || "")}</span>
            </div>
          </div>

          <div style="display: flex; align-items: flex-end; gap: 16px; height: 22px;">
            <div style="display: flex; align-items: flex-end; gap: 6px; width: 100%;">
              <span style="font-size: 11.5px; font-weight: bold; white-space: nowrap;">Program:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; padding: 0 6px; font-size: 11px;">${escapeHtml(studentProfile.program || "")}</span>
            </div>
          </div>
        </div>

        <!-- Salutation & Parent Letter (24px top spacing, 18px line height) -->
        <div style="margin-top: 24px; font-size: 10.5px; line-height: 18px;">
          <p style="margin: 0 0 4px 0;">Dear Parents,</p>
          <p style="margin: 0 0 4px 0; text-indent: 28px; text-align: justify;">
            This Performance Report shows the ability and progress your child has made in the different learning areas as well as his/her core values.
          </p>
          <p style="margin: 0 0 4px 0; text-indent: 28px; text-align: justify;">
            The school welcomes you should you desire to know more about your child's progress.
          </p>
        </div>

        <!-- Learning Progress and Achievement Table (24px top spacing, 32px header, 27px row height) -->
        <div style="margin-top: 24px;">
          <div style="font-size: 11.5px; font-weight: bold; text-align: center; margin-bottom: 6px; letter-spacing: 0.3px; text-transform: uppercase;">
            LEARNING PROGRESS AND ACHIEVEMENT
          </div>
          <table style="width: 100%; border-collapse: collapse; border-spacing: 0; font-size: 15px; color: #000000; border: 1px solid #000000;">
            <thead>
              <tr style="height: 32px;">
                <th rowspan="2" style="border: 1px solid #000000; padding: 4px 6px; width: 42%; text-align: center; font-weight: bold; font-size: 11.5px;">Subjects</th>
                <th colspan="3" style="border: 1px solid #000000; padding: 4px 6px; width: 30%; text-align: center; font-weight: bold; font-size: 11.5px;">TERM</th>
                <th rowspan="2" style="border: 1px solid #000000; padding: 4px 6px; width: 14%; text-align: center; font-weight: bold; font-size: 10.5px; line-height: 1.15;">Final<br/>Grade</th>
                <th rowspan="2" style="border: 1px solid #000000; padding: 4px 6px; width: 14%; text-align: center; font-weight: bold; font-size: 11.5px;">Remarks</th>
              </tr>
              <tr style="height: 20px;">
                <th style="border: 1px solid #000000; padding: 2px 4px; width: 10%; text-align: center; font-weight: bold; font-size: 10.5px;">Term 1</th>
                <th style="border: 1px solid #000000; padding: 2px 4px; width: 10%; text-align: center; font-weight: bold; font-size: 10.5px;">Term 2</th>
                <th style="border: 1px solid #000000; padding: 2px 4px; width: 10%; text-align: center; font-weight: bold; font-size: 10.5px;">Term 3</th>
              </tr>
            </thead>
            <tbody>
              ${grades.map((row) => `
                <tr style="height: 27px; ${row.isHeader ? 'font-weight: bold;' : ''}">
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: left; font-size: 15px; ${row.isSubSubject ? 'padding-left: 16px; font-style: italic;' : ''}">
                    ${escapeHtml(row.name)}
                  </td>
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-size: 15px;">${escapeHtml(row.t1 || "")}</td>
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-size: 15px;">${escapeHtml(row.t2 || "")}</td>
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-size: 15px;">${escapeHtml(row.t3 || "")}</td>
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-weight: bold; font-size: 15px;">${escapeHtml(row.final || "")}</td>
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-size: 15px;">${escapeHtml(row.remark || "")}</td>
                </tr>
              `).join("")}
              <tr style="height: 27px; font-weight: bold;">
                <td colspan="4" style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-weight: bold; font-size: 15px;">General Average</td>
                <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-weight: bold; font-size: 15px;">${escapeHtml(studentProfile.termGrade || "")}</td>
                <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-weight: bold; font-size: 15px;">${escapeHtml(studentProfile.termGrade !== "" ? (studentProfile.honorStatus || "Passed") : "")}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Performance Descriptors Table (24px top spacing, 26px row height) -->
        <div style="margin-top: 24px;">
          <div style="font-size: 11.5px; font-weight: bold; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.2px;">
            PERFORMANCE DESCRIPTORS
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 15px; border: 1px solid #000000;">
            <thead>
              <tr style="height: 26px;">
                <th style="border: 1px solid #000000; padding: 3px 6px; width: 35%; text-align: center; font-weight: bold; background-color: #fafafa; font-size: 15px;">Grading Scale</th>
                <th style="border: 1px solid #000000; padding: 3px 6px; width: 35%; text-align: center; font-weight: bold; background-color: #fafafa; font-size: 15px;">Description</th>
                <th style="border: 1px solid #000000; padding: 3px 6px; width: 30%; text-align: center; font-weight: bold; background-color: #fafafa; font-size: 15px;">Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${descriptorsToUse.map((desc) => `
                <tr style="height: 26px;">
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-size: 15px;">${escapeHtml(desc.scale)}</td>
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-size: 15px;">${escapeHtml(desc.desc)}</td>
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-size: 15px;">${escapeHtml(desc.remarks)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Back Page (Page 2): US Letter 8.5 x 11 in (816 x 1056 px at 96 DPI), Margin 45 px (33.75 pt)
  const backHtml = `
    <div style="width: 816px; height: 1056px; padding: 45px; box-sizing: border-box; background: #ffffff; font-family: 'Times New Roman', Times, Georgia, serif; color: #000000; display: flex; flex-direction: column;">
      
      <!-- Section 1: ATTENDANCE RECORD (Top) -->
      <div>
        <div style="font-size: 11.5px; font-weight: bold; text-align: center; margin-bottom: 6px; letter-spacing: 0.3px; text-transform: uppercase;">
          ATTENDANCE RECORD
        </div>
        <table style="width: 100%; border-collapse: collapse; border-spacing: 0; color: #000000; border: 1px solid #000000;">
          <thead>
            <tr style="height: 30px;">
              <th style="border: 1px solid #000000; padding: 4px 8px; width: 25%; text-align: left; font-weight: bold; font-size: 12px;">Month</th>
              ${months.map((m) => `<th style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 11.5px; font-weight: bold;">${escapeHtml(m)}</th>`).join("")}
              <th style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 12px; font-weight: bold;">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr style="height: 26px;">
              <td style="border: 1px solid #000000; padding: 4px 8px; text-align: left; font-size: 12px; font-weight: bold;">No. of Class Days</td>
              ${classDays.map((d) => `<td style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 13px;">${escapeHtml(d)}</td>`).join("")}
              <td style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 13px; font-weight: bold;">${escapeHtml(getAttendanceTotal(classDays))}</td>
            </tr>
            <tr style="height: 26px;">
              <td style="border: 1px solid #000000; padding: 4px 8px; text-align: left; font-size: 12px; font-weight: bold;">No. of Days Present</td>
              ${daysPresent.map((d) => `<td style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 13px;">${escapeHtml(d)}</td>`).join("")}
              <td style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 13px; font-weight: bold;">${escapeHtml(getAttendanceTotal(daysPresent))}</td>
            </tr>
            <tr style="height: 26px;">
              <td style="border: 1px solid #000000; padding: 4px 8px; text-align: left; font-size: 12px; font-weight: bold;">No. of Days Absent</td>
              ${daysAbsent.map((d) => `<td style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 13px;">${escapeHtml(d)}</td>`).join("")}
              <td style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 13px; font-weight: bold;">${escapeHtml(getAttendanceTotal(daysAbsent))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Section 2: TEACHER'S COMMENTS/REMARKS (Full-Width Bordered Box) -->
      <div style="margin-top: 14px;">
        <div style="font-size: 11.5px; font-weight: bold; text-align: center; margin-bottom: 6px; letter-spacing: 0.3px; text-transform: uppercase;">
          TEACHER'S COMMENTS/REMARKS
        </div>
        <div style="border: 1px solid #000000; height: 126px; width: 100%; box-sizing: border-box; display: flex; flex-direction: column;">
          <div style="border-bottom: 1px solid #000000; padding: 4px 8px; height: 42px; box-sizing: border-box;">
            <span style="font-size: 11px; font-weight: bold; display: block;">Term 1</span>
            <div style="font-size: 10.5px; line-height: 1.25; white-space: pre-wrap; overflow: hidden; max-height: 24px;">${escapeHtml(comments.term1 || "")}</div>
          </div>
          <div style="border-bottom: 1px solid #000000; padding: 4px 8px; height: 42px; box-sizing: border-box;">
            <span style="font-size: 11px; font-weight: bold; display: block;">Term 2</span>
            <div style="font-size: 10.5px; line-height: 1.25; white-space: pre-wrap; overflow: hidden; max-height: 24px;">${escapeHtml(comments.term2 || "")}</div>
          </div>
          <div style="padding: 4px 8px; height: 42px; box-sizing: border-box;">
            <span style="font-size: 11px; font-weight: bold; display: block;">Term 3</span>
            <div style="font-size: 10.5px; line-height: 1.25; white-space: pre-wrap; overflow: hidden; max-height: 24px;">${escapeHtml(comments.term3 || "")}</div>
          </div>
        </div>
      </div>

      <!-- Section 3: PARENTS/GUARDIAN'S SIGNATURE (Indented & Compact) -->
      <div style="margin-top: 14px;">
        <div style="font-size: 11.5px; font-weight: bold; text-align: center; margin-bottom: 8px; letter-spacing: 0.3px; text-transform: uppercase;">
          PARENTS/GUARDIAN'S SIGNATURE
        </div>
        <div style="width: 360px; margin: 0 auto; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: flex-end; gap: 10px;">
            <span style="font-size: 11px; font-weight: bold; width: 55px; white-space: nowrap;">Term 1</span>
            <div style="border-bottom: 1px solid #000000; flex: 1; height: 1px;"></div>
          </div>
          <div style="display: flex; align-items: flex-end; gap: 10px;">
            <span style="font-size: 11px; font-weight: bold; width: 55px; white-space: nowrap;">Term 2</span>
            <div style="border-bottom: 1px solid #000000; flex: 1; height: 1px;"></div>
          </div>
          <div style="display: flex; align-items: flex-end; gap: 10px;">
            <span style="font-size: 11px; font-weight: bold; width: 55px; white-space: nowrap;">Term 3</span>
            <div style="border-bottom: 1px solid #000000; flex: 1; height: 1px;"></div>
          </div>
        </div>
      </div>

      <!-- Section 4: CERTIFICATE OF TRANSFER -->
      <div style="margin-top: 14px; box-sizing: border-box;">
        <div style="font-size: 11.5px; font-weight: bold; text-align: center; margin-bottom: 6px; letter-spacing: 0.3px; text-transform: uppercase;">
          CERTIFICATE OF TRANSFER
        </div>
        <p style="margin: 0 0 8px 0; line-height: 1.35; text-align: left; font-size: 10.5px;">
          This is to certify that the above-named learner has satisfactorily completed the requirements for the grade level indicated.
        </p>
        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;">
          <div style="display: flex; align-items: flex-end; gap: 6px;">
            <span style="white-space: nowrap; font-size: 10.5px; font-weight: bold;">Admitted to Grade:</span>
            <span style="border-bottom: 1px solid #000000; width: 140px; font-weight: bold; padding: 0 4px; font-size: 11px; text-align: center;">${escapeHtml(studentProfile.admittedToGrade || "")}</span>
          </div>
          <div style="display: flex; align-items: flex-end; gap: 6px;">
            <span style="white-space: nowrap; font-size: 10.5px; font-weight: bold;">Eligible for Admission to Grade:</span>
            <span style="border-bottom: 1px solid #000000; width: 180px; font-weight: bold; padding: 0 4px; font-size: 11px; text-align: center;">${escapeHtml(studentProfile.eligibleForAdmission || "")}</span>
          </div>
        </div>

        <div style="margin-top: 4px;">
          <div style="font-weight: bold; font-size: 10.5px; margin-bottom: 4px;">Approved:</div>
          <!-- Adviser signature on the right -->
          <div style="display: flex; justify-content: flex-end; margin-right: 40px; margin-bottom: 6px;">
            <div style="width: 180px; text-align: center;">
              <div style="border-bottom: 1px solid #000000; font-weight: bold; font-size: 11px; padding-bottom: 2px; min-height: 16px;">${escapeHtml(studentProfile.adviserName || "")}</div>
              <div style="font-size: 10px; margin-top: 2px;">Adviser</div>
            </div>
          </div>
          <!-- School Head signature on the left below Adviser -->
          <div style="display: flex; justify-content: flex-start; margin-left: 40px;">
            <div style="width: 180px; text-align: center;">
              <div style="border-bottom: 1px solid #000000; font-weight: bold; font-size: 11px; padding-bottom: 2px; min-height: 16px;">${escapeHtml((studentProfile.principalName || "").toUpperCase())}</div>
              <div style="font-size: 10px; margin-top: 2px;">School Head</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 5: CANCELLATION OF ELIGIBILITY TO TRANSFER -->
      <div style="margin-top: 14px; box-sizing: border-box;">
        <div style="font-size: 11.5px; font-weight: bold; text-align: center; margin-bottom: 6px; letter-spacing: 0.3px; text-transform: uppercase;">
          CANCELLATION OF ELIGIBILITY TO TRANSFER
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding: 0 10px;">
          <div style="display: flex; align-items: flex-end; gap: 6px; width: 45%;">
            <span style="white-space: nowrap; font-size: 10.5px; font-weight: bold;">Admitted in:</span>
            <span style="border-bottom: 1px solid #000000; flex: 1; height: 1px;"></span>
          </div>
          <div style="display: flex; align-items: flex-end; gap: 6px; width: 45%;">
            <span style="white-space: nowrap; font-size: 10.5px; font-weight: bold;">Date:</span>
            <span style="border-bottom: 1px solid #000000; flex: 1; height: 1px;"></span>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-start; margin-left: 10px;">
          <div style="width: 180px; text-align: center;">
            <div style="border-bottom: 1px solid #000000; font-weight: bold; font-size: 11px; padding-bottom: 2px; min-height: 16px;">${escapeHtml((studentProfile.principalName || "").toUpperCase())}</div>
            <div style="font-size: 10px; margin-top: 2px;">School Head</div>
          </div>
        </div>
      </div>
    </div>
  `;

  return [frontHtml, backHtml];
}

export function printSf9Report(options, title, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return resolve();
    const pages = buildSf9Pages(options);
    const frame = document.createElement("iframe");
    frame.title = title;
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    let originalTitle;
    let cleanupTimer;
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearTimeout(cleanupTimer);
      signal.removeEventListener("abort", cleanup);
      window.removeEventListener("afterprint", cleanup);
      if (originalTitle !== undefined && document.title === title) document.title = originalTitle;
      frame.remove();
      resolve();
    };

    const fail = (error) => {
      reject(error);
      cleanup();
    };

    cleanupTimer = setTimeout(() => fail(new Error("SF9 print preview did not load.")), 5000);
    signal.addEventListener("abort", cleanup, { once: true });
    frame.onerror = () => fail(new Error("SF9 print preview could not load."));
    frame.onload = () => {
      clearTimeout(cleanupTimer);
      try {
        const printWindow = frame.contentWindow;
        originalTitle = document.title;
        document.title = title;
        window.addEventListener("afterprint", cleanup, { once: true });
        printWindow.addEventListener("afterprint", cleanup, { once: true });
        printWindow.focus();
        printWindow.print();
        // Some browsers return from print without dispatching afterprint.
        // Button availability must not depend on that event.
        resolve();
        if (!cleanedUp) cleanupTimer = setTimeout(cleanup, 120_000);
      } catch (error) {
        fail(error);
      }
    };

    frame.srcdoc = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<title>' + escapeHtml(title) + '</title><style>' +
      '@page { size: letter; margin: 0; } html,body { margin: 0; padding: 0; }' +
      'section { break-inside: avoid; } section + section { break-before: page; }' +
      '</style></head><body>' + pages.map((page) => '<section>' + page + '</section>').join('') +
      '</body></html>';
    document.body.appendChild(frame);
  });
}

/** Creates a two-page SF9 PDF in the browser. */
export async function exportSf9Pdf(options) {
  const { studentProfile = {}, skipDownload = false, fileName } = options;
  const [frontHtml, backHtml] = buildSf9Pages(options);
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:0;top:0;width:816px;z-index:-9999;opacity:0;pointer-events:none";
  const page1Div = document.createElement("div");
  page1Div.innerHTML = frontHtml;
  container.appendChild(page1Div);

  const page2Div = document.createElement("div");
  page2Div.innerHTML = backHtml;
  container.appendChild(page2Div);

  document.body.appendChild(container);

  try {
    const canvasOptions = {
      scale: 2.5, // 240 DPI on letter paper
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 816,
      windowHeight: 1056,
      imageTimeout: 5000,
    };

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "letter",
      compress: true,
    });

    for (const page of [page1Div, page2Div]) {
      const canvas = await html2canvas(page.firstElementChild, canvasOptions);
      try {
        // Encode directly to bytes so jsPDF can embed the image without re-compressing it.
        const image = await new Promise((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Could not encode SF9 PDF page."));
          }, "image/jpeg", 0.98);
        });
        if (page === page2Div) pdf.addPage();
        pdf.addImage(new Uint8Array(await image.arrayBuffer()), "JPEG", 0, 0, 612, 792);
      } finally {
        canvas.width = canvas.height = 0;
      }
    }

    const nameParts = (studentProfile.name || "STUDENT").split(",");
    const lastName = nameParts[0].trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "");
    const resolvedFileName = fileName || `${lastName || "STUDENT"}_SF9.pdf`;
    pdf.setProperties({ title: resolvedFileName.replace(/\.pdf$/i, "") });

    if (!skipDownload) {
      pdf.save(resolvedFileName);
    }

    const blob = pdf.output("blob");
    return { pdf, blob, fileName: resolvedFileName };
  } finally {
    document.body.removeChild(container);
  }
}

