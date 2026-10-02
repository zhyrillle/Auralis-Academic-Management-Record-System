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
}) {
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "816px";
  container.style.backgroundColor = "#ffffff";
  container.style.fontFamily = "'Times New Roman', Times, Georgia, serif";
  container.style.boxSizing = "border-box";

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

  // Front Page (Page 1): US Letter 8.5 x 11 in (816 x 1056 px at 96 DPI), Margin 0.5 in (48px padding)
  const frontHtml = `
    <div style="width: 816px; height: 1056px; padding: 48px; box-sizing: border-box; background: #ffffff; font-family: 'Times New Roman', Times, Georgia, serif; color: #000000; font-size: 11px; line-height: 1.25; display: flex; flex-direction: column; justify-content: space-between;">
      <div>
        <!-- Header Section -->
        <div style="margin-bottom: 14px;">
          <div style="display: grid; grid-template-columns: 80px 1fr 80px; align-items: center; gap: 10px;">
            <div style="text-align: center;">
              ${
                depedLogo
                  ? `<img src="${depedLogo}" alt="DepEd Seal" style="width: 74px; height: 74px; object-fit: contain;" />`
                  : `<div style="width: 74px; height: 74px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 9px;">DepEd Logo</div>`
              }
            </div>
            <div style="text-align: center;">
              <p style="font-size: 11px; margin: 0; line-height: 1.25;">Republic of the Philippines</p>
              <p style="font-size: 11px; margin: 0; line-height: 1.25;">Department of Education</p>
              <p style="font-size: 11px; margin: 0; line-height: 1.25; font-weight: bold;">SCHOOLS DIVISION OFFICE OF GINGOOG CITY</p>
              <p style="font-size: 11px; margin: 0; line-height: 1.25;">West 1 District</p>
              <p style="font-size: 11.5px; font-weight: bold; margin: 4px 0 2px 0; text-transform: uppercase;">GINGOOG CITY COMPREHENSIVE NATIONAL HIGH SCHOOL</p>
              <h2 style="font-size: 13px; font-weight: bold; margin: 3px 0 2px 0; letter-spacing: 0.4px; text-transform: uppercase;">LEARNER'S PERFORMANCE REPORT</h2>
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
        </div>

        <!-- Learner Info Grid -->
        <div style="margin-top: 10px; margin-bottom: 12px; font-size: 11px;">
          <div style="display: flex; align-items: flex-end; gap: 14px; margin-bottom: 6px;">
            <div style="display: flex; align-items: flex-end; gap: 6px; flex: 2; min-width: 140px;">
              <span style="font-size: 11px; white-space: nowrap;">Name:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; padding: 0 6px; font-size: 11px; text-transform: uppercase;">${studentProfile.name || ""}</span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 6px; width: 85px;">
              <span style="font-size: 11px; white-space: nowrap;">Age:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; text-align: center; font-size: 11px;">${studentProfile.age ?? ""}</span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 6px; width: 100px;">
              <span style="font-size: 11px; white-space: nowrap;">Sex:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; text-align: center; font-size: 11px;">${studentProfile.sex || ""}</span>
            </div>
          </div>

          <div style="display: flex; align-items: flex-end; gap: 14px; margin-bottom: 6px;">
            <div style="display: flex; align-items: flex-end; gap: 6px; flex: 2; min-width: 140px;">
              <span style="font-size: 11px; white-space: nowrap;">LRN:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; padding: 0 6px; font-size: 11px;">${studentProfile.lrn || ""}</span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 6px; width: 90px;">
              <span style="font-size: 11px; white-space: nowrap;">Grade:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; text-align: center; font-size: 11px;">${studentProfile.grade || studentProfile.gradeLevel || ""}</span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 6px; flex: 1.2; min-width: 140px;">
              <span style="font-size: 11px; white-space: nowrap;">Section:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; text-align: center; font-size: 11px;">${studentProfile.section || ""}</span>
            </div>
          </div>

          <div style="display: flex; align-items: flex-end; gap: 14px;">
            <div style="display: flex; align-items: flex-end; gap: 6px; width: 100%;">
              <span style="font-size: 11px; white-space: nowrap;">Program:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; padding: 0 6px; font-size: 11px;">${studentProfile.program || ""}</span>
            </div>
          </div>
        </div>

        <!-- Message to Parents -->
        <div style="margin-top: 10px; margin-bottom: 12px; font-size: 10.5px; line-height: 1.35;">
          <p style="margin: 0 0 4px 0;">Dear Parents,</p>
          <p style="margin: 0 0 4px 0; text-indent: 28px; text-align: justify;">
            This Performance Report shows the ability and progress your child has made in the different learning areas as well as his/her core values.
          </p>
          <p style="margin: 0 0 4px 0; text-indent: 28px; text-align: justify;">
            The school welcomes you should you desire to know more about your child's progress.
          </p>
        </div>

        <!-- Learning Progress Table -->
        <div style="font-size: 11.5px; font-weight: bold; text-align: center; margin-top: 10px; margin-bottom: 6px; letter-spacing: 0.3px; text-transform: uppercase;">
          LEARNING PROGRESS AND ACHIEVEMENT
        </div>
        <table style="width: 100%; border-collapse: collapse; border-spacing: 0; font-size: 11px; color: #000000; border: 1px solid #000000; margin-bottom: 14px;">
          <thead>
            <tr>
              <th rowspan="2" style="border: 1px solid #000000; padding: 4px 6px; width: 44%; text-align: center; font-weight: bold;">Subjects</th>
              <th colspan="3" style="border: 1px solid #000000; padding: 4px 6px; width: 27%; text-align: center; font-weight: bold;">TERM</th>
              <th rowspan="2" style="border: 1px solid #000000; padding: 4px 6px; width: 14%; text-align: center; font-weight: bold; font-size: 10.5px; line-height: 1.15;">Final<br/>Grade</th>
              <th rowspan="2" style="border: 1px solid #000000; padding: 4px 6px; width: 15%; text-align: center; font-weight: bold;">Remarks</th>
            </tr>
            <tr>
              <th style="border: 1px solid #000000; padding: 4px 6px; width: 9%; text-align: center; font-weight: bold; font-size: 10.5px;">Term 1</th>
              <th style="border: 1px solid #000000; padding: 4px 6px; width: 9%; text-align: center; font-weight: bold; font-size: 10.5px;">Term 2</th>
              <th style="border: 1px solid #000000; padding: 4px 6px; width: 9%; text-align: center; font-weight: bold; font-size: 10.5px;">Term 3</th>
            </tr>
          </thead>
          <tbody>
            ${grades.map((row) => `
              <tr style="${row.isHeader ? 'font-weight: bold;' : ''}">
                <td style="border: 1px solid #000000; padding: 4px 6px; text-align: left; ${row.isSubSubject ? 'padding-left: 22px; font-style: italic;' : ''}">
                  ${row.name}
                </td>
                <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center;">${row.t1 || ""}</td>
                <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center;">${row.t2 || ""}</td>
                <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center;">${row.t3 || ""}</td>
                <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold;">${row.final || ""}</td>
                <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-size: 10.5px;">${row.remark || ""}</td>
              </tr>
            `).join("")}
            <tr style="font-weight: bold;">
              <td colspan="4" style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold;">General Average</td>
              <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold;">${studentProfile.termGrade || ""}</td>
              <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold; font-size: 10.5px;">${studentProfile.termGrade !== "" ? (studentProfile.honorStatus || "Passed") : ""}</td>
            </tr>
          </tbody>
        </table>

        <!-- Performance Descriptors Table -->
        <div style="margin-top: 10px;">
          <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.2px;">
            PERFORMANCE DESCRIPTORS
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; border: 1px solid #000000; margin-top: 4px;">
            <thead>
              <tr>
                <th style="border: 1px solid #000000; padding: 4px 6px; width: 35%; text-align: center; font-weight: bold; background-color: #fafafa;">Grading Scale</th>
                <th style="border: 1px solid #000000; padding: 4px 6px; width: 35%; text-align: center; font-weight: bold; background-color: #fafafa;">Description</th>
                <th style="border: 1px solid #000000; padding: 4px 6px; width: 30%; text-align: center; font-weight: bold; background-color: #fafafa;">Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${descriptorsToUse.map((desc) => `
                <tr>
                  <td style="border: 1px solid #000000; padding: 3.5px 6px; text-align: center;">${desc.scale}</td>
                  <td style="border: 1px solid #000000; padding: 3.5px 6px; text-align: center;">${desc.desc}</td>
                  <td style="border: 1px solid #000000; padding: 3.5px 6px; text-align: center;">${desc.remarks}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Back Page (Page 2): US Letter 8.5 x 11 in (816 x 1056 px at 96 DPI), Margin 0.5 in (48px padding)
  const backHtml = `
    <div style="width: 816px; height: 1056px; padding: 48px; box-sizing: border-box; background: #ffffff; font-family: 'Times New Roman', Times, Georgia, serif; color: #000000; font-size: 11px; line-height: 1.25; display: flex; flex-direction: column; justify-content: space-between;">
      <div>
        <!-- Attendance Record Table -->
        <div style="font-size: 11.5px; font-weight: bold; text-align: center; margin-top: 0; margin-bottom: 6px; letter-spacing: 0.3px; text-transform: uppercase;">
          ATTENDANCE RECORD
        </div>
        <table style="width: 100%; border-collapse: collapse; border-spacing: 0; font-size: 11px; color: #000000; border: 1px solid #000000; margin-bottom: 14px;">
          <thead>
            <tr>
              <th style="border: 1px solid #000000; padding: 4px 6px; width: 25%; text-align: center; font-weight: bold; font-size: 10.5px;">Metric Name</th>
              ${months.map((m) => `<th style="border: 1px solid #000000; padding: 3.5px 2px; width: 6.2%; text-align: center; font-size: 10px; font-weight: bold;">${m}</th>`).join("")}
              <th style="border: 1px solid #000000; padding: 3.5px 2px; width: 6.8%; text-align: center; font-size: 10px; font-weight: bold;">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000000; padding: 4px 6px; text-align: left; font-size: 10.5px;">No. of Class Days</td>
              ${classDays.map((d) => `<td style="border: 1px solid #000000; padding: 3.5px 2px; text-align: center; font-size: 10px;">${d}</td>`).join("")}
              <td style="border: 1px solid #000000; padding: 3.5px 2px; text-align: center; font-size: 10px; font-weight: bold;">${getAttendanceTotal(classDays)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000000; padding: 4px 6px; text-align: left; font-size: 10.5px;">No. of Days Present</td>
              ${daysPresent.map((d) => `<td style="border: 1px solid #000000; padding: 3.5px 2px; text-align: center; font-size: 10px;">${d}</td>`).join("")}
              <td style="border: 1px solid #000000; padding: 3.5px 2px; text-align: center; font-size: 10px; font-weight: bold;">${getAttendanceTotal(daysPresent)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000000; padding: 4px 6px; text-align: left; font-size: 10.5px;">No. of Days Absent</td>
              ${daysAbsent.map((d) => `<td style="border: 1px solid #000000; padding: 3.5px 2px; text-align: center; font-size: 10px;">${d}</td>`).join("")}
              <td style="border: 1px solid #000000; padding: 3.5px 2px; text-align: center; font-size: 10px; font-weight: bold;">${getAttendanceTotal(daysAbsent)}</td>
            </tr>
          </tbody>
        </table>

        <!-- Narrative & Signatures Section -->
        <div style="margin-top: 10px;">
          <div style="font-size: 11.5px; font-weight: bold; text-align: center; margin-top: 6px; margin-bottom: 6px; letter-spacing: 0.3px; text-transform: uppercase;">
            TEACHER'S COMMENTS/REMARKS
          </div>
          <div style="border: 1px solid #000000; margin-top: 4px; margin-bottom: 12px;">
            <div style="border-bottom: 1px solid #000000; padding: 6px 10px;">
              <span style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 2px;">Term 1</span>
              <div style="font-size: 10.5px; line-height: 1.35; white-space: pre-wrap; min-height: 32px;">${comments.term1 || ""}</div>
            </div>
            <div style="border-bottom: 1px solid #000000; padding: 6px 10px;">
              <span style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 2px;">Term 2</span>
              <div style="font-size: 10.5px; line-height: 1.35; white-space: pre-wrap; min-height: 32px;">${comments.term2 || ""}</div>
            </div>
            <div style="padding: 6px 10px;">
              <span style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 2px;">Term 3</span>
              <div style="font-size: 10.5px; line-height: 1.35; white-space: pre-wrap; min-height: 32px;">${comments.term3 || ""}</div>
            </div>
          </div>
        </div>

        <div style="margin-top: 10px;">
          <div style="font-size: 11.5px; font-weight: bold; text-align: center; margin-top: 6px; margin-bottom: 6px; letter-spacing: 0.3px; text-transform: uppercase;">
            PARENTS/GUARDIAN'S SIGNATURE
          </div>
          <div style="margin-top: 8px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 14px; padding: 0 30px;">
            <div style="display: flex; align-items: flex-end; gap: 12px;">
              <span style="font-size: 11px; font-weight: bold; width: 55px;">Term 1</span>
              <div style="border-bottom: 1px solid #000000; flex: 1; height: 14px;"></div>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 12px;">
              <span style="font-size: 11px; font-weight: bold; width: 55px;">Term 2</span>
              <div style="border-bottom: 1px solid #000000; flex: 1; height: 14px;"></div>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 12px;">
              <span style="font-size: 11px; font-weight: bold; width: 55px;">Term 3</span>
              <div style="border-bottom: 1px solid #000000; flex: 1; height: 14px;"></div>
            </div>
          </div>
        </div>

        <!-- Transfer Certificate Block -->
        <div style="margin-top: 12px; font-size: 11px;">
          <div style="font-size: 11.5px; font-weight: bold; text-align: center; margin-top: 6px; margin-bottom: 6px; letter-spacing: 0.3px; text-transform: uppercase;">
            CERTIFICATE OF TRANSFER
          </div>
          <p style="margin: 4px 0 8px 0; line-height: 1.35; text-align: justify;">
            This is to certify that the above-named learner has satisfactorily completed the requirements for the grade level indicated.
          </p>
          <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px;">
            <div style="display: flex; align-items: flex-end; gap: 8px;">
              <span style="white-space: nowrap;">Admitted to Grade:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; padding: 0 6px;">${studentProfile.admittedToGrade || ""}</span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 8px;">
              <span style="white-space: nowrap;">Eligible for Admission to Grade:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1; font-weight: bold; padding: 0 6px;">${studentProfile.eligibleForAdmission || ""}</span>
            </div>
          </div>

          <div style="margin-top: 10px;">
            <div style="font-weight: bold;">Approved:</div>
            <div style="display: flex; justify-content: space-between; gap: 24px; margin-top: 24px; padding: 0 20px;">
              <div style="flex: 1; text-align: center;">
                <div style="border-bottom: 1px solid #000000; font-weight: bold; padding-bottom: 2px;">${studentProfile.principalName || ""}</div>
                <div style="font-size: 10px; margin-top: 3px; font-style: italic;">School Head</div>
              </div>
              <div style="flex: 1; text-align: center;">
                <div style="border-bottom: 1px solid #000000; font-weight: bold; padding-bottom: 2px;">${studentProfile.adviserName || ""}</div>
                <div style="font-size: 10px; margin-top: 3px; font-style: italic;">Adviser</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Cancellation of Eligibility Block -->
        <div style="margin-top: 14px; font-size: 11px;">
          <div style="font-size: 11.5px; font-weight: bold; text-align: center; margin-top: 6px; margin-bottom: 6px; letter-spacing: 0.3px; text-transform: uppercase;">
            CANCELLATION OF ELIGIBILITY TO TRANSFER
          </div>
          <div style="display: flex; gap: 20px; margin-bottom: 14px;">
            <div style="display: flex; align-items: flex-end; gap: 8px; flex: 1;">
              <span style="white-space: nowrap;">Admitted in:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1;"></span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 8px; flex: 1;">
              <span style="white-space: nowrap;">Date:</span>
              <span style="border-bottom: 1px solid #000000; flex: 1;"></span>
            </div>
          </div>

          <div style="margin-top: 12px; display: flex; justify-content: flex-start; padding-left: 20px;">
            <div style="width: 200px; text-align: center;">
              <div style="border-bottom: 1px solid #000000; font-weight: bold; padding-bottom: 2px;">${studentProfile.principalName || ""}</div>
              <div style="font-size: 10px; margin-top: 3px; font-style: italic;">School Head</div>
            </div>
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
    const canvas1 = await html2canvas(page1Div.firstElementChild, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 816,
      windowHeight: 1056,
    });

    const canvas2 = await html2canvas(page2Div.firstElementChild, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 816,
      windowHeight: 1056,
    });

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "letter",
    });

    const img1Data = canvas1.toDataURL("image/png");
    pdf.addImage(img1Data, "PNG", 0, 0, 612, 792);

    pdf.addPage();
    const img2Data = canvas2.toDataURL("image/png");
    pdf.addImage(img2Data, "PNG", 0, 0, 612, 792);

    const nameParts = (studentProfile.name || "STUDENT").split(",");
    const lastName = nameParts[0].trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "");
    pdf.save(`${lastName || "STUDENT"}_SF9.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

