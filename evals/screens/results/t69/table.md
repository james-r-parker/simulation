| Arm            | verdict | pop > min | catch > 0 | mating mean >= 0.2 | born mean >= 0.5 | lineages >= 5 | spec <= 70% | pop < max | pop mean | mating vs ref | lineages vs ref | births/1k vs ref | food/1k vs ref | fed life vs ref |
| -------------- | ------- | --------- | --------- | ------------------ | ---------------- | ------------- | ----------- | --------- | -------- | ------------- | --------------- | ---------------- | -------------- | --------------- |
| `sexes-min100` | FAIL    | 4/4       | 4/4       | 0.05 FAIL          | 0.96 ok          | 4/4           | 1/4         | 4/4       | 432      | -27%          | 0%              | -1%              | -6%            | +4%             |
| `sexes-min40`  | FAIL    | 4/4       | 3/4       | 0.04 FAIL          | 0.96 ok          | 4/4           | 1/4         | 4/4       | 425      | -50%          | +6%             | -1%              | -6%            | -1%             |
| `sexes-off`    | FAIL    | 4/4       | 4/4       | 0.07 FAIL          | 0.96 ok          | 4/4           | 1/4         | 4/4       | 436      | =             | =               | =                | =              | =               |

Reference arm: `sexes-off`.
