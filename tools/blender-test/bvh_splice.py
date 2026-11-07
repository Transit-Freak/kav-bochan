"""מחבר שתי הקלטות BVH של אותו שחקן (CMU 16_15 הליכה + 16_34 הליכה איטית ועצירה) להליכה אחת שנעצרת.
מוצאים את זוג הפריימים שבו התנוחות הכי דומות (בלי מיקום השורש), מזיזים את ההקלטה השנייה כך שהשורש ימשיך באותה נקודה,
ומעבר רך של 0.1 שנייה בזוויות. שימוש: python3 bvh_splice.py walk.bvh stop.bvh out.bvh [שניות_מקסימום_מהראשונה]"""
import sys

def load(p):
    L = open(p).read().split('\n')
    i = next(k for k, l in enumerate(L) if l.strip().startswith('MOTION'))
    ft = L[i + 2]
    data = [list(map(float, l.split())) for l in L[i + 3:] if l.strip()]
    return L[:i], ft, data

def ang(a, b):
    d = (a - b + 180) % 360 - 180
    return d

def main():
    a_p, b_p, out = sys.argv[1:4]
    max_a = float(sys.argv[4]) if len(sys.argv) > 4 else 1.6
    ha, fta, A = load(a_p); hb, ftb, B = load(b_p)
    assert len(A[0]) == len(B[0])
    n = len(A[0])
    best = None
    for i in range(int(0.5 * 120), min(len(A) - 1, int(max_a * 120))):
        for j in range(0, min(len(B) - 1, int(0.7 * 120)), 2):
            ra, rb = A[i], B[j]
            e = sum(ang(ra[c], rb[c]) ** 2 for c in range(3, n)) + 50 * (ra[1] - rb[1]) ** 2
            # גם המהירות של השורש צריכה להתאים
            va = A[i + 1][2] - A[i][2]; vb = B[j + 1][2] - B[j][2]
            e += 2000 * (va - vb) ** 2
            if best is None or e < best[0]: best = (e, i, j)
    e, i, j = best
    dx, dz = A[i][0] - B[j][0], A[i][2] - B[j][2]
    res = [r[:] for r in A[:i]]
    X = 12
    for k, r in enumerate(B[j:]):
        r = r[:]; r[0] += dx; r[2] += dz
        if k < X:                                   # מעבר רך: מהתנוחה של הראשונה אל השנייה
            w = (k + 1) / (X + 1); ra = A[min(i + k, len(A) - 1)]
            for c in range(3, n): r[c] = ra[c] + ang(r[c], ra[c]) * w
            r[1] = ra[1] * (1 - w) + r[1] * w
        res.append(r)
    with open(out, 'w') as f:
        f.write('\n'.join(ha) + '\nMOTION\nFrames: %d\n%s\n' % (len(res), fta))
        for r in res: f.write(' '.join('%.6f' % v for v in r) + '\n')
    print('SPLICE', a_p.split('/')[-1], 'frames 0..%d' % i, '+', b_p.split('/')[-1], 'from %d' % j, 'err %.1f' % e, 'total', len(res),
          'walk %.1f units' % (res[-1][2] - res[0][2]))

if __name__ == '__main__':
    main()
