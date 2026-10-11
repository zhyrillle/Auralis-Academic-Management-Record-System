"""Private JSON-in/JSON-out worker. Load only our trusted local notebook export."""
import json
import math
from pathlib import Path
import platform
import sys

import joblib
import numpy as np
import pandas as pd
import sklearn

HERE = Path(__file__).resolve().parent


def load_model():
    metadata = json.loads((HERE / "model_metadata.json").read_text())
    versions = {
        "python_version": platform.python_version(),
        "scikit_learn_version": sklearn.__version__,
        "pandas_version": pd.__version__,
        "numpy_version": np.__version__,
        "joblib_version": joblib.__version__,
    }
    if any(versions[key] != metadata[key] for key in versions):
        raise ValueError("Model runtime does not match the notebook export; use backend/ml/requirements.txt and Python 3.14.3.")
    bundle = joblib.load(HERE / "english-model.joblib")
    if bundle["features"] != metadata["features"] or bundle["threshold"] != metadata["threshold"]:
        raise ValueError("Model and metadata do not match. Replace them together from the approved notebook export.")
    return bundle, metadata


def predict(bundle, metadata, records):
    if not isinstance(records, list) or len(records) > 5000:
        raise ValueError("Expected at most 5000 feature records.")
    for record in records:
        if set(record) != set(bundle["features"]):
            raise ValueError("Each record must supply the nine named model inputs.")
        for name, value in record.items():
            if value is None and (name.startswith("phil_iri_") and name != "phil_iri_unavailable" or name == "absence_rate"):
                continue
            maximum = 1 if name in ("absence_rate", "phil_iri_unavailable") else 100
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= maximum:
                raise ValueError(f"Invalid input: {name}.")
        if record["phil_iri_unavailable"] not in (0, 1):
            raise ValueError("Phil-IRI availability must be 0 or 1.")
        missing = [record[name] is None for name in bundle["features"] if name.startswith("phil_iri_") and name != "phil_iri_unavailable"]
        if (record["phil_iri_unavailable"] == 1 and not all(missing)) or (record["phil_iri_unavailable"] == 0 and any(missing)):
            raise ValueError("Phil-IRI sub-scores and availability flag disagree.")
    scores = []
    if records:
        frame = pd.DataFrame(records, columns=bundle["features"]).astype(float)
        scores = bundle["pipeline"].predict_proba(frame)[:, 1]
    return {
        "modelVersion": metadata["version"], "threshold": float(bundle["threshold"]),
        "predictions": [{
            "score": float(score),
            "riskLevel": "low" if score <= 0.30 else "medium" if score < 0.70 else "high",
            "predictedAtRisk": bool(score >= bundle["threshold"]),
        } for score in scores],
    }


if __name__ == "__main__":
    try:
        saved_bundle, saved_metadata = load_model()
        payload = json.load(sys.stdin)
        json.dump(predict(saved_bundle, saved_metadata, payload["records"]), sys.stdout, allow_nan=False)
    except Exception as error:
        # No learner records or feature values are included in error output.
        json.dump({"error": str(error)}, sys.stdout)
        sys.exit(1)
