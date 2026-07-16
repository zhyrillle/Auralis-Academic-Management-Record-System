import { useEffect, useState } from "react";
import campusPhoto from "../assets/campus-photo.png";
import curveShape from "../assets/curve-shape.png";
import rectMain from "../assets/RoundedRectangle.png";
import rectShade from "../assets/RoundedRectangle-1.png";
import "../styles/auth.css";

const DESIGN_WIDTH = 1440;
const DESIGN_HEIGHT = 800;
const MIN_VIEWPORT = 1280;
const MAX_VIEWPORT = 1920;

// Nudge this to control how far the white curve eats into the panel.
// 0.60 means the navy panel occupies the left 60%, curve/white takes the right 40%.
const CURVE_BOUNDARY_RATIO = 0.50;
const CURVE_LEFT = DESIGN_WIDTH * CURVE_BOUNDARY_RATIO - 260; // 260 = tuning offset, adjust to taste

export default function AuthLayout({ children, showPhoto = false, illustration = null, hideRectangles = false }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function updateScale() {
      const clampedWidth = Math.min(Math.max(window.innerWidth, MIN_VIEWPORT), MAX_VIEWPORT);
      setScale(clampedWidth / DESIGN_WIDTH);
    }
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  return (
    <div className="auth-viewport">
      <div
        className="design-canvas"
        style={{
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        {showPhoto && (
          <>
            <img src={campusPhoto} className="layer-photo" alt="" />
            <div className="photo-tint" />
          </>
        )}

        {!hideRectangles && (
          <>
            <img
              src={rectShade}
              className="layer-shape layer-shape-blend"
              alt=""
              style={{
                left: 0,
                top: 0,
                transform: "rotate(0deg)",
              }}
            />

            <img
              src={rectMain}
              className="layer-shape layer-shape-blend"
              alt=""
              style={{
                left: 0,
                top: 0,
                transform: "rotate(0deg)",
              }}
            />
          </>
        )}

        <img
          src={curveShape}
          className="layer-shape"
          alt=""
          style={{
            left: CURVE_LEFT,
            top: -50,
            width: 1017.55,
            height: 1290.41,
          }}
        />

        {illustration && <img src={illustration} className="layer-illustration" alt="" />}

        <div className="form-panel">{children}</div>
      </div>
    </div>
  );
}