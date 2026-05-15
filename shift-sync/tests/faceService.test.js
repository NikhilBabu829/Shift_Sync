const { verifyFace, isValidDescriptor } = require('../services/faceService');

describe('faceService', () => {
    describe('isValidDescriptor', () => {
        it('should return true for a valid 128-dimensional array of numbers', () => {
            const valid = new Array(128).fill(0.5);
            expect(isValidDescriptor(valid)).toBe(true);
        });

        it('should return false if not an array', () => {
            expect(isValidDescriptor('not an array')).toBe(false);
        });

        it('should return false if array length is not 128', () => {
            const invalid = new Array(127).fill(0.5);
            expect(isValidDescriptor(invalid)).toBe(false);
        });

        it('should return false if array contains non-numbers', () => {
            const invalid = new Array(128).fill(0.5);
            invalid[0] = 'string';
            expect(isValidDescriptor(invalid)).toBe(false);
        });
    });

    describe('verifyFace', () => {
        it('should verify faces with distance below threshold', () => {
            const stored = new Array(128).fill(0.1);
            const incoming = new Array(128).fill(0.12);
            // Distance will be sqrt(128 * 0.02^2) = sqrt(128 * 0.0004) = sqrt(0.0512) ≈ 0.226
            const result = verifyFace(stored, incoming);
            expect(result.isVerified).toBe(true);
            expect(result.distance).toBeCloseTo(0.226, 2);
        });

        it('should reject faces with distance above threshold', () => {
            const stored = new Array(128).fill(0.1);
            const incoming = new Array(128).fill(0.9);
            // Distance will be large
            const result = verifyFace(stored, incoming);
            expect(result.isVerified).toBe(false);
            expect(result.distance).toBeGreaterThan(0.5); // Default threshold
        });
    });
});
