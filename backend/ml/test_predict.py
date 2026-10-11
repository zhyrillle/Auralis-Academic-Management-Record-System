import math
import unittest
import pandas as pd
from predict import load_model, predict


class ModelWorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle, cls.metadata = load_model()

    def record(self):
        return dict(ww_pct=80, pt_pct=80, qa_pct=75, previous_final_grade=80,
                    phil_iri_literal_pct=None, phil_iri_inferential_pct=None,
                    phil_iri_critical_pct=None, phil_iri_unavailable=1, absence_rate=None)

    def test_same_saved_pipeline_with_missing_values(self):
        record = self.record()
        result = predict(self.bundle, self.metadata, [record])
        frame = pd.DataFrame([record], columns=self.bundle['features']).astype(float)
        expected = self.bundle['pipeline'].predict_proba(frame)[0, 1]
        self.assertTrue(math.isclose(result['predictions'][0]['score'], expected, abs_tol=1e-12))
        self.assertEqual(result['threshold'], 0.35)
        self.assertEqual(result['predictions'][0]['predictedAtRisk'], bool(expected >= 0.35))

    def test_empty_batch_checks_model_without_inventing_rows(self):
        self.assertEqual(predict(self.bundle, self.metadata, [])['predictions'], [])

    def test_recorded_absence_rates_pass_through_and_only_missing_rate_is_imputed(self):
        records = [{**self.record(), 'absence_rate': value} for value in (0, 0.05, 1, None)]
        frame = pd.DataFrame(records, columns=self.bundle['features']).astype(float)
        imputer = next(step for _, step in self.bundle['pipeline'].steps if hasattr(step, 'statistics_'))
        transformed = pd.DataFrame(imputer.transform(frame))
        index = self.bundle['features'].index('absence_rate')
        self.assertEqual(transformed.iloc[:3, index].tolist(), [0, 0.05, 1])
        self.assertEqual(transformed.iloc[3, index], imputer.statistics_[index])
        result = predict(self.bundle, self.metadata, records)
        expected = self.bundle['pipeline'].predict_proba(frame)[:, 1]
        for row, score in zip(result['predictions'], expected):
            self.assertTrue(math.isclose(row['score'], score, abs_tol=1e-12))

    def test_invalid_and_inconsistent_inputs_fail(self):
        for changes in ({'ww_pct': None}, {'qa_pct': 101}, {'absence_rate': 25},
                        {'phil_iri_unavailable': 0}, {'pt_pct': float('inf')}):
            record = {**self.record(), **changes}
            with self.assertRaises(ValueError):
                predict(self.bundle, self.metadata, [record])

    def test_legacy_task_counts_are_rejected(self):
        with self.assertRaises(ValueError):
            predict(self.bundle, self.metadata, [{**self.record(), 'ww_task_count': 8}])


if __name__ == '__main__':
    unittest.main()
