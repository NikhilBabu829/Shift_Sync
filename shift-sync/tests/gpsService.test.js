const { runVelocityChecks, detectZeroVariance } = require('../services/gpsService');

describe('gpsService', () => {
    describe('detectZeroVariance', () => {
        it('should return false if less than 2 coordinates', () => {
            expect(detectZeroVariance([{ lat: 40.7128, lng: -74.0060 }])).toBe(false);
            expect(detectZeroVariance([])).toBe(false);
        });

        it('should return true if all coordinates are exactly the same', () => {
            const coords = [
                { lat: 40.7128, lng: -74.0060 },
                { lat: 40.7128, lng: -74.0060 },
                { lat: 40.7128, lng: -74.0060 }
            ];
            expect(detectZeroVariance(coords)).toBe(true);
        });

        it('should return false if coordinates vary', () => {
            const coords = [
                { lat: 40.7128, lng: -74.0060 },
                { lat: 40.7129, lng: -74.0061 }
            ];
            expect(detectZeroVariance(coords)).toBe(false);
        });
    });

    describe('runVelocityChecks', () => {
        beforeAll(() => {
            process.env.DRIVE_BY_THRESHOLD_MPH = '10';
        });

        it('should not flag if velocity is below threshold', () => {
            const coords = [
                { lat: 40.7128, lng: -74.0060, timestamp: 1000 },
                { lat: 40.7129, lng: -74.0060, timestamp: 60000 } // Small distance over 1 minute
            ];
            const result = runVelocityChecks(coords);
            expect(result.isDriveByPunch).toBe(false);
        });

        it('should flag if velocity exceeds threshold', () => {
            const coords = [
                { lat: 40.7128, lng: -74.0060, timestamp: 1000 },
                { lat: 41.7128, lng: -74.0060, timestamp: 2000 } // Huge distance in 1 second
            ];
            const result = runVelocityChecks(coords);
            expect(result.isDriveByPunch).toBe(true);
            expect(result.maxVelocityMph).toBeGreaterThan(10);
        });
    });
});
