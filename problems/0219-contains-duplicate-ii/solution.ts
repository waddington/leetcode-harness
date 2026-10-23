// 219. Contains Duplicate II  [Easy]
// https://leetcode.com/problems/contains-duplicate-ii/
//
// Paste the LeetCode TypeScript skeleton below (replacing the function),
// then implement it. Run/Debug THIS file from your IDE to test.
import { runTests } from "#harness";


function containsNearbyDuplicate(nums: number[], k: number): boolean {
    const lastSeen = new Map<number, number>(); // number -> latest index
    for (let i = 0; i < nums.length; i++) {
        const j = lastSeen.get(nums[i]);
        if (j !== undefined && i - j <= k) return true;
        lastSeen.set(nums[i], i);
    }
    return false;
};


// Tests live in test_cases.txt next to this file (LeetCode example syntax).
// Pass your function here; rename it if you paste a different skeleton.
// For problems where any valid ordering is accepted, pass { unordered: true }.
// To debug one failing case, isolate it with e.g. { only: 3 } (or { only: [1, 3] }).
runTests(containsNearbyDuplicate);
