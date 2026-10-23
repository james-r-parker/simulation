| Arm                  | verdict | pop > min | catch > 0 | mating mean >= 0.2 | born mean >= 0.5 | lineages >= 5 | spec <= 70% | pop < max | pop mean | mating vs ref | lineages vs ref | births/1k vs ref | food/1k vs ref | fed life vs ref |
| -------------------- | ------- | --------- | --------- | ------------------ | ---------------- | ------------- | ----------- | --------- | -------- | ------------- | --------------- | ---------------- | -------------- | --------------- |
| `base`               | FAIL    | 4/4       | 3/4       | 0.04 FAIL          | 0.96 ok          | 4/4           | 1/4         | 4/4       | 425      | =             | =               | =                | =              | =               |
| `splitCapMargin-100` | FAIL    | 4/4       | 3/4       | 0.05 FAIL          | 0.95 ok          | 4/4           | 2/4         | 4/4       | 379      | +26%          | -11%            | -5%              | -5%            | +9%             |
| `splitCapMargin-150` | FAIL    | 4/4       | 4/4       | 0.03 FAIL          | 0.95 ok          | 4/4           | 1/4         | 4/4       | 334      | -27%          | -11%            | -6%              | +8%            | +3%             |
| `splitCapMargin-250` | FAIL    | 4/4       | 4/4       | 0.04 FAIL          | 0.93 ok          | 4/4           | 0/4         | 4/4       | 241      | +20%          | -13%            | +2%              | -6%            | -1%             |

Reference arm: `base`.
