| Arm                  | verdict | pop > min | catch > 0 | mating mean >= 0.2 | born mean >= 0.5 | lineages >= 5 | spec <= 70% | pop < max | pop mean | mating vs ref | lineages vs ref | births/1k vs ref | food/1k vs ref | fed life vs ref |
| -------------------- | ------- | --------- | --------- | ------------------ | ---------------- | ------------- | ----------- | --------- | -------- | ------------- | --------------- | ---------------- | -------------- | --------------- |
| `base`               | FAIL    | 4/4       | 2/4       | 0.05 FAIL          | 0.95 ok          | 4/4           | 0/4         | 4/4       | 401      | =             | =               | =                | =              | =               |
| `predator-plant-1`   | FAIL    | 4/4       | 3/4       | 0.04 FAIL          | 0.96 ok          | 4/4           | 1/4         | 4/4       | 425      | -24%          | +14%            | +11%             | +17%           | -17%            |
| `predator-plant-0.3` | FAIL    | 4/4       | 2/4       | 0.06 FAIL          | 0.96 ok          | 4/4           | 0/4         | 4/4       | 397      | +12%          | +2%             | +11%             | +10%           | -14%            |

Reference arm: `base`.
