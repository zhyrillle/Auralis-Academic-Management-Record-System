const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

// Resolve Chrome or Edge browser executable on host
function resolveBrowserExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const candidatePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  throw new Error('No compatible Chrome or Edge browser executable found for PDF generation. Set PUPPETEER_EXECUTABLE_PATH.');
}

// Read and cache institutional logos as Base64 strings
let cachedDepedLogo = null;
let cachedGccnhsLogo = null;
let cachedOptimizedLogos = null;
let optimizedLogosPromise = null;

function getLogos() {
  if (cachedOptimizedLogos) {
    return cachedOptimizedLogos;
  }

  if (!cachedDepedLogo) {
    const depedPath = path.join(__dirname, '../assets/deped_logo.png');
    if (fs.existsSync(depedPath)) {
      cachedDepedLogo = `data:image/png;base64,${fs.readFileSync(depedPath).toString('base64')}`;
    }
  }

  if (!cachedGccnhsLogo) {
    const gccnhsPath = path.join(__dirname, '../assets/gccnhs_logo.png');
    if (fs.existsSync(gccnhsPath)) {
      cachedGccnhsLogo = `data:image/png;base64,${fs.readFileSync(gccnhsPath).toString('base64')}`;
    }
  }

  return { depedLogo: cachedDepedLogo || '', gccnhsLogo: cachedGccnhsLogo || '' };
}

/**
 * Downscales oversized institutional logo assets once in memory (e.g. 2194x2193 1.2MB PNG -> 300x300 ~30KB PNG)
 * so Chromium does not re-decode and re-embed a multi-megapixel PNG for a 74x74px print seal on every SF9 PDF.
 * At 74x74px (0.77in), 300x300px provides ~390 DPI print crispness while cutting render time & PDF size by >10x.
 */
async function ensureOptimizedLogos(browser) {
  if (cachedOptimizedLogos) return cachedOptimizedLogos;
  if (optimizedLogosPromise) return optimizedLogosPromise;

  const raw = getLogos();
  const needsOptimization =
    (raw.depedLogo && raw.depedLogo.length > 35000) ||
    (raw.gccnhsLogo && raw.gccnhsLogo.length > 35000);

  if (!needsOptimization) {
    cachedOptimizedLogos = raw;
    return cachedOptimizedLogos;
  }

  optimizedLogosPromise = (async () => {
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      const resizeDataUri = async (dataUri, maxDim = 240) => {
        if (!dataUri || dataUri.length <= 35000) return dataUri;
        return await page.evaluate(
          (src, maxSize) =>
            new Promise((resolve) => {
              const img = new Image();
              img.onload = () => {
                const scale = Math.min(1, maxSize / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
                const w = Math.max(1, Math.round(img.naturalWidth * scale));
                const h = Math.max(1, Math.round(img.naturalHeight * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                // SF9 page background is solid white; JPEG at 240x240 (~311 DPI at 74px) embeds directly into PDF /DCTDecode without PNG re-compression overhead
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, w, h);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.92));
              };
              img.onerror = () => resolve(src);
              img.src = src;
            }),
          dataUri,
          maxDim
        );
      };

      const [depedLogo, gccnhsLogo] = await Promise.all([
        resizeDataUri(raw.depedLogo, 240),
        resizeDataUri(raw.gccnhsLogo, 240),
      ]);
      cachedOptimizedLogos = { depedLogo, gccnhsLogo };
      return cachedOptimizedLogos;
    } catch (err) {
      console.warn('[Sf9PdfService] Logo optimization skipped:', err.message);
      cachedOptimizedLogos = raw;
      return raw;
    } finally {
      await context.close().catch(() => {});
      optimizedLogosPromise = null;
    }
  })();

  return optimizedLogosPromise;
}

/**
 * Builds standard SF9 HTML document matching the exact UI scale and layout of exportSf9Pdf.js
 */
function buildSf9Html({ studentProfile = {}, grades = [], performanceDescriptors = [], attendanceData = {}, comments = {} }) {
  const { depedLogo, gccnhsLogo } = getLogos();

  const months = attendanceData?.months && attendanceData.months.length > 0
    ? attendanceData.months
    : ["Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];

  const classDays = attendanceData?.classDays || new Array(months.length).fill(0);
  const daysPresent = attendanceData?.daysPresent || new Array(months.length).fill(0);
  const daysAbsent = attendanceData?.daysAbsent || new Array(months.length).fill(0);

  const getAttendanceTotal = (arr = []) =>
    arr.reduce((acc, curr) => acc + (Number(curr) || 0), 0);

  const defaultDescriptors = [
    { scale: "90-100", desc: "Advancing", remarks: "Passed" },
    { scale: "80-89", desc: "Benchmarking", remarks: "Passed" },
    { scale: "75-79", desc: "Connecting", remarks: "Passed" },
    { scale: "65-74", desc: "Developing", remarks: "Failed" },
    { scale: "0-64", desc: "Emerging", remarks: "Failed" }
  ];

  const descriptorsToUse = performanceDescriptors && performanceDescriptors.length > 0
    ? performanceDescriptors
    : defaultDescriptors;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>${getSf9PdfTitle(studentProfile)}</title>
  <style>
    @page {
      size: 816px 1056px;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: 'Times New Roman', Times, Georgia, serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page-sheet {
      width: 816px;
      height: 1056px;
      padding: 45px;
      box-sizing: border-box;
      background: #ffffff;
      page-break-inside: avoid;
      break-inside: avoid;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .page-1 {
      justify-content: space-between;
      page-break-after: always;
      break-after: page;
    }
  </style>
</head>
<body>
  <!-- Front Page (Page 1): US Letter 8.5 x 11 in (816 x 1056 px at 96 DPI), Margin 45 px -->
  <div class="page-sheet page-1">
    <div>
      <!-- Institutional Header -->
      <div style="display: grid; grid-template-columns: 74px 1fr 74px; align-items: center; gap: 12px; margin-bottom: 0;">
        <div style="text-align: center;">
          ${depedLogo ? `<img src="${depedLogo}" alt="DepEd Seal" style="width: 74px; height: 74px; object-fit: contain;" />` : ''}
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
          ${gccnhsLogo ? `<img src="${gccnhsLogo}" alt="School Seal" style="width: 74px; height: 74px; object-fit: contain;" />` : ''}
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

  <!-- Back Page (Page 2): US Letter 8.5 x 11 in (816 x 1056 px at 96 DPI), Margin 45 px -->
  <div class="page-sheet page-2">
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
          <div style="font-size: 10.5px; line-height: 1.25; white-space: pre-wrap; overflow: hidden; max-height: 24px;">${comments?.term1 || ""}</div>
        </div>
        <div style="border-bottom: 1px solid #000000; padding: 4px 8px; height: 42px; box-sizing: border-box;">
          <span style="font-size: 11px; font-weight: bold; display: block;">Term 2</span>
          <div style="font-size: 10.5px; line-height: 1.25; white-space: pre-wrap; overflow: hidden; max-height: 24px;">${comments?.term2 || ""}</div>
        </div>
        <div style="padding: 4px 8px; height: 42px; box-sizing: border-box;">
          <span style="font-size: 11px; font-weight: bold; display: block;">Term 3</span>
          <div style="font-size: 10.5px; line-height: 1.25; white-space: pre-wrap; overflow: hidden; max-height: 24px;">${comments?.term3 || ""}</div>
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
            <div style="border-bottom: 1px solid #000000; font-weight: bold; font-size: 11px; padding-bottom: 2px; min-height: 16px;">${(studentProfile.principalName || "").toUpperCase()}</div>
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
          <div style="border-bottom: 1px solid #000000; font-weight: bold; font-size: 11px; padding-bottom: 2px; min-height: 16px;">${(studentProfile.principalName || "").toUpperCase()}</div>
          <div style="font-size: 10px; margin-top: 2px;">School Head</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function getSf9PdfTitle(studentProfile = {}) {
  const lastName = (studentProfile.name || '').split(',')[0].trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  return `${lastName || 'STUDENT'}_SF9`;
}

let browserPromise;

function getSf9Browser() {
  if (browserPromise) return browserPromise;

  const launch = puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });
  browserPromise = launch;
  const reset = () => {
    if (browserPromise === launch) browserPromise = undefined;
  };
  launch.then(browser => browser.once('disconnected', reset), reset);
  return launch;
}

const PDF_OPTIONS = Object.freeze({
  width: '816px',
  height: '1056px',
  printBackground: true,
  preferCSSPageSize: true,
});

/** Generates an official SF9 PDF from the learner's report data. */
async function generateSf9Pdf(options) {
  const browser = await getSf9Browser();
  await ensureOptimizedLogos(browser);
  const html = buildSf9Html(options);
  // Keep each learner's report isolated while sharing the Chrome process.
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setViewport({ width: 816, height: 1056 });
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf(PDF_OPTIONS);
  } finally {
    await context.close();
  }
}

/**
 * Generates multiple official SF9 PDFs concurrently using a bounded pool of pages inside
 * a single isolated browser context (JS disabled + strict CSP guarantees zero cross-learner state).
 *
 * @param {Array<{ fileName: string, options: object }>} items
 * @param {{ concurrency?: number, onProgress?: (info: { index: number, completed: number, total: number, fileName: string, studentName: string, buffer: Buffer }) => void|Promise<void>, retainBuffers?: boolean }} [config]
 * @returns {Promise<Array<{ fileName: string, buffer: Buffer }>>}
 */
async function generateSf9PdfBatch(items, { concurrency = 1, onProgress = null, retainBuffers = true } = {}) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const browser = await getSf9Browser();
  await ensureOptimizedLogos(browser);

  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, items.length));
  const results = retainBuffers ? new Array(items.length) : [];
  const context = await browser.createBrowserContext();

  try {
    const pages = await Promise.all(
      Array.from({ length: workerCount }, async () => {
        const page = await context.newPage();
        await page.setJavaScriptEnabled(false);
        await page.setViewport({ width: 816, height: 1056 });
        return page;
      })
    );

    let nextIndex = 0;
    let completed = 0;
    await Promise.all(
      pages.map(async (page) => {
        while (nextIndex < items.length) {
          const currentIndex = nextIndex++;
          const item = items[currentIndex];
          const html = buildSf9Html(item.options);
          await page.setContent(html, { waitUntil: 'load' });
          const pdfBytes = await page.pdf(PDF_OPTIONS);
          const buffer = Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
          completed += 1;

          if (retainBuffers) {
            results[currentIndex] = {
              fileName: item.fileName,
              buffer,
            };
          }

          if (typeof onProgress === 'function') {
            await onProgress({
              index: currentIndex,
              completed,
              total: items.length,
              fileName: item.fileName,
              studentName: item.options?.studentProfile?.name || item.fileName,
              buffer,
            });
          }
        }
      })
    );

    return retainBuffers ? results.filter(Boolean) : [];
  } finally {
    await context.close();
  }
}

// Precomputed IEEE CRC-32 lookup table for zero-dependency ZIP archive creation
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Packs in-memory files into a standard ZIP archive using STORE (method 0).
 * PDFs are already internally compressed, so STORE avoids redundant CPU work while staying compact.
 *
 * @param {Array<{ fileName: string, buffer: Buffer|Uint8Array }>} files
 * @returns {Buffer}
 */
function createZipBuffer(files) {
  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(String(file.fileName), 'utf8');
    const dataBuf = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
    const checksum = crc32(dataBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const centralDirSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

module.exports = {
  generateSf9Pdf,
  generateSf9PdfBatch,
  createZipBuffer,
  buildSf9Html,
  resolveBrowserExecutable,
};
