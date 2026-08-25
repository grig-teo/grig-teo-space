import Testing
@testable import ColmiRingApp

/** Pins the typical-range bands shown under Latest readings charts. */
struct MetricGuideTests {

    @Test
    func everyMetricHasFourBands() {
        for metric in RingMetric.allCases {
            #expect(metric.guideBands.count == 4, "\(metric.rawValue)")
        }
    }

    @Test
    func heartRateClassifiesRestingAndHigh() {
        #expect(RingMetric.heartRate.classify(49)?.label == "Low")
        #expect(RingMetric.heartRate.classify(50)?.label == "Normal")
        #expect(RingMetric.heartRate.classify(68)?.label == "Normal")
        #expect(RingMetric.heartRate.classify(90)?.label == "Elevated")
        #expect(RingMetric.heartRate.classify(121)?.label == "High")
    }

    @Test
    func spo2TreatsSub90AsLowAnd98AsBest() {
        #expect(RingMetric.spo2.classify(89)?.label == "Low")
        #expect(RingMetric.spo2.classify(94)?.label == "Fair")
        #expect(RingMetric.spo2.classify(96)?.label == "Normal")
        #expect(RingMetric.spo2.classify(98)?.label == "Best")
    }

    @Test
    func stepsGoalIsTenThousand() {
        #expect(RingMetric.steps.classify(4_999)?.label == "Sedentary")
        #expect(RingMetric.steps.classify(7_500)?.label == "Typical")
        #expect(RingMetric.steps.classify(10_000)?.label == "Goal")
    }

    @Test
    func stressLowIsRelaxed() {
        #expect(RingMetric.stress.classify(10)?.label == "Relaxed")
        #expect(RingMetric.stress.classify(40)?.label == "Normal")
        #expect(RingMetric.stress.classify(80)?.label == "High")
    }

    @Test
    func hrvHigherIsBetter() {
        #expect(RingMetric.hrv.classify(15)?.label == "Low")
        #expect(RingMetric.hrv.classify(52)?.label == "Good")
        #expect(RingMetric.hrv.classify(80)?.label == "Best")
    }

    @Test
    func sleepSevenToNineIsBest() {
        #expect(RingMetric.sleepDurationH.classify(5.5)?.label == "Short")
        #expect(RingMetric.sleepDurationH.classify(7.4)?.label == "Best")
        #expect(RingMetric.sleepDurationH.classify(9)?.label == "Best")
        #expect(RingMetric.sleepDurationH.classify(9.5)?.label == "Long")
    }

    @Test
    func sleepQualityMatchesSleepPageThresholds() {
        #expect(RingMetric.sleepQuality.classify(40)?.label == "Poor")
        #expect(RingMetric.sleepQuality.classify(65)?.label == "Good")
        #expect(RingMetric.sleepQuality.classify(88)?.label == "Best")
    }

    @Test
    func caloriesAndDistanceClassifyDailyTotals() {
        #expect(RingMetric.calories.classify(180)?.label == "Light")
        #expect(RingMetric.calories.classify(400)?.label == "Typical")
        #expect(RingMetric.calories.classify(600)?.label == "Active")
        #expect(RingMetric.distanceKm.classify(2)?.label == "Low")
        #expect(RingMetric.distanceKm.classify(8)?.label == "Goal")
        #expect(RingMetric.distanceKm.classify(12)?.label == "High")
    }

    @Test
    func activityMetricsSkipChartDomain() {
        #expect(RingMetric.steps.chartGuideDomain == nil)
        #expect(RingMetric.calories.chartGuideDomain == nil)
        #expect(RingMetric.distanceKm.chartGuideDomain == nil)
        #expect(RingMetric.heartRate.chartGuideDomain != nil)
    }
}
