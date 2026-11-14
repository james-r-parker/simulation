// The agent shader's body tweens: `tweenP` applies the one-shot tween (kind and age from `iTween`, numbered as `TWEEN` in
// body-tweens.js) to the body's local point, and `bodyStates` the continuous ones (sick sway, cold shiver, heat pant,
// the throb of a call that is still sounding). Dividing the point grows the body; a tween never takes it past the quad.

import { TWEEN } from './body-tweens.js';

const K = Object.fromEntries(Object.entries(TWEEN).map(([name, v]) => [name, `${v}.5`]));

export const TWEEN_GLSL = /* glsl */ `
float easeElastic(float t) {
    if (t <= 0.0 || t >= 1.0) return t;
    return pow(2.0, -10.0 * t) * sin((t * 10.0 - 0.75) * 2.0943951) + 1.0;
}

float gulpScale(float a) {
    if (a < 0.3) return 0.12 * a / 0.3;
    if (a < 0.6) return mix(0.12, -0.03, (a - 0.3) / 0.3);
    return mix(-0.03, 0.0, (a - 0.6) / 0.4);
}

vec2 tweenP(vec2 p) {
    float k = vTween.x;
    float a = vTween.y;
    if (uBody <= 0.0 || k < 0.5) return p;
    if (k < ${K.LUNGE}) {
        float s = a < 0.25 ? a / 0.25 : 1.0 - (a - 0.25) / 0.75;
        s = s * s * (3.0 - 2.0 * s);
        return p / vec2(1.0 + 0.25 * s, 1.0 - 0.15 * s);
    }
    if (k < ${K.FLINCH}) {
        float s = sin(a * 3.14159265) * (1.0 - 0.3 * a);
        return p / vec2(1.0 - 0.25 * s, 1.0 + 0.12 * s);
    }
    if (k < ${K.GULP}) return p / (1.0 + gulpScale(a));
    if (k < ${K.CALL_THROB}) return p / (1.0 + 0.18 * abs(sin(a * 9.42477796)));
    if (k < ${K.HOWL}) return p / vec2(1.0 + 0.15 * abs(sin(a * 9.42477796)), 1.0);
    if (k < ${K.COURT}) return p / (1.0 + 0.1 * abs(sin(a * 6.28318531)));
    if (k < ${K.BIRTH_POP}) return p / max(mix(0.2, 1.0, easeElastic(a)), 0.05);
    if (k < ${K.SHAKE_OFF}) return p + vec2(sin(a * 40.0) * 0.06 * (1.0 - a), 0.0);
    return p / (1.0 + gulpScale(a));
}

vec2 bodyStates(vec2 p, float cold, float hot) {
    if (uBody < 0.75) return p;
    float phase = vMotion.z * 6.2831853;
    p.x += 0.06 * vSick * sin(uTime * 9.42477796 + phase);
    p += 0.03 * cold * vec2(sin(uTime * 75.4 + phase * 40.0), cos(uTime * 71.0 + phase * 31.0));
    p /= 1.0 + 0.03 * hot * sin(uTime * 18.849556);
    float beat = pow(max(sin(uSimTick * 0.31415927 + phase), 0.0), 8.0);
    if (vTween.z > 0.5 && vTween.z < 1.5) p /= 1.0 + 0.1 * beat;
    if (vTween.z > 1.5) p /= vec2(1.0 + 0.1 * beat, 1.0);
    return p;
}
`;
