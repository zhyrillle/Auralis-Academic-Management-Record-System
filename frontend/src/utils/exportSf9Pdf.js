import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

/**
 * Multi-page portrait PDF exporter for Student SF9 Learner's Performance Report.
 * Renders Front Page (Performance Report & Descriptors) and Back Page (Attendance, Comments, Signatures & Certificate of Transfer)
 * matching official DepEd format, font sizes, spacing, seals, and table borders.
 */
export async function exportSf9Pdf({
  studentProfile = {},
  grades = [],
  performanceDescriptors = [],
  attendanceData = { months: [], classDays: [], daysPresent: [], daysAbsent: [] },
  comments = { term1: "", term2: "", term3: "" },
  depedLogo,
  gccnhsLogo,
  skipDownload = false,
}) {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = "816px";
  container.style.backgroundColor = "#ffffff";
  container.style.fontFamily = "'Times New Roman', Times, Georgia, serif";
  container.style.boxSizing = "border-box";
  container.style.zIndex = "-9999";
  container.style.opacity = "0";
  container.style.pointerEvents = "none";
  container.style.webkitFontSmoothing = "antialiased";
  container.style.textRendering = "geometricPrecision";

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
                ? `<img src="${depedLogo}" alt="DepEd Seal" style="width: 74px; height: 74px; object-fit: contain;" />`
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
            <p style="font-size: 11px; margin: 0;">School Year ${studentProfile.schoolYear || ""}</p>
          </div>
          <div style="text-align: center;">
            ${
              gccnhsLogo
                ? `<img src="${gccnhsLogo}" alt="School Seal" style="width: 74px; height: 74px; object-fit: contain;" />`
                : `<div style="width: 74px; height: 74px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 9px;">School Logo</div>`
            }
          </div>
        </div>

        <!-- Learner Information Block (20px top spacing, 22px vertical pitch) -->
        <div style="margin-top: 20px; font-size: 11px;">
          <div style="display: flex; align-items: flex-end; gap: 16px; height: 22px;">
            <div style="display: flex; align-items: flex-end; gap: 6px; flex: 2;">
              <span style="font-size: 11.5px; font-weight: bold; white-space: nowrap;">Name:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; padding: 0 6px; font-size: 11px; text-transform: uppercase;">${studentProfile.name || ""}</span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 6px; width: 85px;">
              <span style="font-size: 11.5px; font-weight: bold; white-space: nowrap;">Age:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; text-align: center; font-size: 11px;">${studentProfile.age ?? ""}</span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 6px; width: 100px;">
              <span style="font-size: 11.5px; font-weight: bold; white-space: nowrap;">Sex:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; text-align: center; font-size: 11px;">${studentProfile.sex || ""}</span>
            </div>
          </div>

          <div style="display: flex; align-items: flex-end; gap: 16px; height: 22px;">
            <div style="display: flex; align-items: flex-end; gap: 6px; flex: 2;">
              <span style="font-size: 11.5px; font-weight: bold; white-space: nowrap;">LRN:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; padding: 0 6px; font-size: 11px;">${studentProfile.lrn || ""}</span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 6px; width: 90px;">
              <span style="font-size: 11.5px; font-weight: bold; white-space: nowrap;">Grade:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; text-align: center; font-size: 11px;">${studentProfile.grade || studentProfile.gradeLevel || ""}</span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 6px; flex: 1.2;">
              <span style="font-size: 11.5px; font-weight: bold; white-space: nowrap;">Section:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; text-align: center; font-size: 11px;">${studentProfile.section || ""}</span>
            </div>
          </div>

          <div style="display: flex; align-items: flex-end; gap: 16px; height: 22px;">
            <div style="display: flex; align-items: flex-end; gap: 6px; width: 100%;">
              <span style="font-size: 11.5px; font-weight: bold; white-space: nowrap;">Program:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; padding: 0 6px; font-size: 11px;">${studentProfile.program || ""}</span>
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
                    ${row.name}
                  </td>
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-size: 15px;">${row.t1 || ""}</td>
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-size: 15px;">${row.t2 || ""}</td>
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-size: 15px;">${row.t3 || ""}</td>
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-weight: bold; font-size: 15px;">${row.final || ""}</td>
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-size: 15px;">${row.remark || ""}</td>
                </tr>
              `).join("")}
              <tr style="height: 27px; font-weight: bold;">
                <td colspan="4" style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-weight: bold; font-size: 15px;">General Average</td>
                <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-weight: bold; font-size: 15px;">${studentProfile.termGrade || ""}</td>
                <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-weight: bold; font-size: 15px;">${studentProfile.termGrade !== "" ? (studentProfile.honorStatus || "Passed") : ""}</td>
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
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-size: 15px;">${desc.scale}</td>
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-size: 15px;">${desc.desc}</td>
                  <td style="border: 1px solid #000000; padding: 3px 6px; text-align: center; font-size: 15px;">${desc.remarks}</td>
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
              ${months.map((m) => `<th style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 11.5px; font-weight: bold;">${m}</th>`).join("")}
              <th style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 12px; font-weight: bold;">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr style="height: 26px;">
              <td style="border: 1px solid #000000; padding: 4px 8px; text-align: left; font-size: 12px; font-weight: bold;">No. of Class Days</td>
              ${classDays.map((d) => `<td style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 13px;">${d}</td>`).join("")}
              <td style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 13px; font-weight: bold;">${getAttendanceTotal(classDays)}</td>
            </tr>
            <tr style="height: 26px;">
              <td style="border: 1px solid #000000; padding: 4px 8px; text-align: left; font-size: 12px; font-weight: bold;">No. of Days Present</td>
              ${daysPresent.map((d) => `<td style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 13px;">${d}</td>`).join("")}
              <td style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 13px; font-weight: bold;">${getAttendanceTotal(daysPresent)}</td>
            </tr>
            <tr style="height: 26px;">
              <td style="border: 1px solid #000000; padding: 4px 8px; text-align: left; font-size: 12px; font-weight: bold;">No. of Days Absent</td>
              ${daysAbsent.map((d) => `<td style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 13px;">${d}</td>`).join("")}
              <td style="border: 1px solid #000000; padding: 4px 2px; text-align: center; font-size: 13px; font-weight: bold;">${getAttendanceTotal(daysAbsent)}</td>
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
            <div style="font-size: 10.5px; line-height: 1.25; white-space: pre-wrap; overflow: hidden; max-height: 24px;">${comments.term1 || ""}</div>
          </div>
          <div style="border-bottom: 1px solid #000000; padding: 4px 8px; height: 42px; box-sizing: border-box;">
            <span style="font-size: 11px; font-weight: bold; display: block;">Term 2</span>
            <div style="font-size: 10.5px; line-height: 1.25; white-space: pre-wrap; overflow: hidden; max-height: 24px;">${comments.term2 || ""}</div>
          </div>
          <div style="padding: 4px 8px; height: 42px; box-sizing: border-box;">
            <span style="font-size: 11px; font-weight: bold; display: block;">Term 3</span>
            <div style="font-size: 10.5px; line-height: 1.25; white-space: pre-wrap; overflow: hidden; max-height: 24px;">${comments.term3 || ""}</div>
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
            <span style="border-bottom: 1px solid #000000; width: 140px; font-weight: bold; padding: 0 4px; font-size: 11px; text-align: center;">${studentProfile.admittedToGrade || ""}</span>
          </div>
          <div style="display: flex; align-items: flex-end; gap: 6px;">
            <span style="white-space: nowrap; font-size: 10.5px; font-weight: bold;">Eligible for Admission to Grade:</span>
            <span style="border-bottom: 1px solid #000000; width: 180px; font-weight: bold; padding: 0 4px; font-size: 11px; text-align: center;">${studentProfile.eligibleForAdmission || ""}</span>
          </div>
        </div>

        <div style="margin-top: 4px;">
          <div style="font-weight: bold; font-size: 10.5px; margin-bottom: 4px;">Approved:</div>
          <!-- Adviser signature on the right -->
          <div style="display: flex; justify-content: flex-end; margin-right: 40px; margin-bottom: 6px;">
            <div style="width: 180px; text-align: center;">
              <div style="border-bottom: 1px solid #000000; font-weight: bold; font-size: 11px; padding-bottom: 2px; min-height: 16px;">${studentProfile.adviserName || ""}</div>
              <div style="font-size: 10px; margin-top: 2px;">Adviser</div>
            </div>
          </div>
          <!-- School Head signature on the left below Adviser -->
          <div style="display: flex; justify-content: flex-start; margin-left: 40px;">
            <div style="width: 180px; text-align: center;">
              <div style="border-bottom: 1px solid #000000; font-weight: bold; font-size: 11px; padding-bottom: 2px; min-height: 16px;">${studentProfile.principalName ? `${studentProfile.principalName}, Ph.D.` : ""}</div>
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
            <div style="border-bottom: 1px solid #000000; font-weight: bold; font-size: 11px; padding-bottom: 2px; min-height: 16px;">${studentProfile.principalName ? `${studentProfile.principalName}, Ph.D.` : ""}</div>
            <div style="font-size: 10px; margin-top: 2px;">School Head</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const page1Div = document.createElement("div");
  page1Div.innerHTML = frontHtml;
  container.appendChild(page1Div);

  const page2Div = document.createElement("div");
  page2Div.innerHTML = backHtml;
  container.appendChild(page2Div);

  document.body.appendChild(container);

  try {
    if (document.fonts) {
      await document.fonts.ready;
    }

    const canvasOptions = {
      scale: 4, // 384 DPI - razor-sharp print-grade resolution, completely eliminates blur
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 816,
      windowHeight: 1056,
      imageTimeout: 15000,
    };

    const canvas1 = await html2canvas(page1Div.firstElementChild, canvasOptions);
    const canvas2 = await html2canvas(page2Div.firstElementChild, canvasOptions);

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "letter",
      compress: true,
    });

    const img1Data = canvas1.toDataURL("image/png");
    pdf.addImage(img1Data, "PNG", 0, 0, 612, 792, undefined, "FAST");

    pdf.addPage();
    const img2Data = canvas2.toDataURL("image/png");
    pdf.addImage(img2Data, "PNG", 0, 0, 612, 792, undefined, "FAST");

    const nameParts = (studentProfile.name || "STUDENT").split(",");
    const lastName = nameParts[0].trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "");
    const resolvedFileName = `${lastName || "STUDENT"}_SF9.pdf`;

    if (!skipDownload) {
      pdf.save(resolvedFileName);
    }

    const blob = pdf.output("blob");
    return { pdf, blob, fileName: resolvedFileName };
  } finally {
    document.body.removeChild(container);
  }
}

