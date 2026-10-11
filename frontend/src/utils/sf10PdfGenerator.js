import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

/**
 * Generates and downloads a high-resolution 2-page Letter-sized SF10-JHS PDF
 * directly in the browser from the rendered Page 1 and Page 2 DOM elements.
 * 
 * @param {HTMLElement} page1El - Page 1 DOM element
 * @param {HTMLElement} page2El - Page 2 DOM element
 * @param {string} fileName - Destination filename, e.g. "CRUZ_SF10.pdf"
 */
export async function generateSF10PdfFromPages(page1El, page2El, fileName = "SF10.pdf") {
  if (!page1El || !page2El) {
    throw new Error("SF10 document pages not available for PDF capture.");
  }

  // Render Page 1 with high resolution
  const canvas1 = await html2canvas(page1El, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    imageTimeout: 15000
  });

  // Render Page 2 with high resolution
  const canvas2 = await html2canvas(page2El, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    imageTimeout: 15000
  });

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter", // 612 x 792 pt
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 18; // 0.25 in margins = 18 pt
  const printWidth = pageWidth - margin * 2;

  // Page 1
  const img1Data = canvas1.toDataURL("image/png");
  const img1Height = (canvas1.height * printWidth) / canvas1.width;
  pdf.addImage(img1Data, "PNG", margin, margin, printWidth, Math.min(img1Height, pageHeight - margin * 2));

  // Page 2
  pdf.addPage();
  const img2Data = canvas2.toDataURL("image/png");
  const img2Height = (canvas2.height * printWidth) / canvas2.width;
  pdf.addImage(img2Data, "PNG", margin, margin, printWidth, Math.min(img2Height, pageHeight - margin * 2));

  pdf.save(fileName);
  return true;
}
