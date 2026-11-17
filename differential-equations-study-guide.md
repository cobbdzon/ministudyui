# Differential Equations Study Guide

A comprehensive study guide covering the essential topics, methods, and concepts in differential equations.

---

## Table of Contents

1. [Classification of Differential Equations](#1-classification-of-differential-equations)
2. [First Order Differential Equations](#2-first-order-differential-equations)
   - [Autonomous Equations](#2a-autonomous-equations)
   - [Separable Equations](#2b-separable-equations)
   - [Linear Equations](#2c-linear-equations)
   - [Modeling Applications](#2d-modelling-applications)
3. [Second Order Linear Differential Equations](#3-second-order-linear-differential-equations)
   - [Homogeneous Equations with Constant Coefficients](#3a-homogeneous-equations-with-constant-coefficients)
   - [Non-Homogeneous Equations: Undetermined Coefficients](#3b-non-homogeneous-equations-undetermined-coefficients)
   - [Non-Homogeneous Equations: Variation of Parameters](#3c-non-homogeneous-equations-variation-of-parameters)
   - [Spring-Mass Model](#3d-the-spring-mass-model)
4. [Laplace Transforms](#4-laplace-transforms)
5. [First Order Linear Differential Systems](#5-first-order-linear-differential-systems)
6. [Systems of Differential Equations](#6-systems-of-differential-equations)
7. [Additional Topics](#7-additional-topics)

---

## 1. Classification of Differential Equations

**Order:** The order of a DE is the order of the highest derivative present.
- Example: `y''' + y' = 0` is third-order.

**Linearity:** A DE is **linear** if it can be written as:
```
a_n(x) y^(n) + a_{n-1}(x) y^(n-1) + ... + a_1(x) y' + a_0(x) y = g(x)
```
where the coefficients `a_i(x)` and the function `g(x)` depend only on `x` (not on `y` or its derivatives).

- **Linear:** `y' + p(x)y = g(x)`, `y'' + 3y' + 2y = 0`
- **Nonlinear:** `y' = y^2`, `y'' + y^2 = 0`

**Given a DE, determine its order and whether it is linear or nonlinear.** (Zill §1.1, Exercises 1, 3, 5, 7)

---

## 2. First Order Differential Equations

### 2A. Autonomous Equations

**Form:** `dy/dx = f(y)` — the derivative depends only on `y`.

**Steps:**
1. **Find equilibrium solutions:** Solve `f(y) = 0`
2. **Sketch phase portrait:** Determine the direction of solution curves in each region
3. **Classify equilibrium solutions:**
   - **Asymptotically stable attractor:** Solutions approach the equilibrium
   - **Semi-stable equilibrium:** Solutions approach from one side, depart from the other
   - **Unstable repeller:** Solutions move away from the equilibrium

**Example:** `dy/dx = 10 + 3y - y^2`
- Equilibrium: `y = 5` (stable), `y = -2` (unstable)
- Phase portrait: `y > 5` → decreasing; `-2 < y < 5` → increasing; `y < -2` → decreasing

### 2B. Separable Equations

**Form:** `dy/dx = g(x)h(y)` — variables can be separated.

**Steps:**
1. Separate variables: `dy/h(y) = g(x)dx`
2. Integrate both sides: `∫ dy/h(y) = ∫ g(x)dx`
3. Simplify and solve for `y`
4. For IVPs, use initial condition to find the constant

**Key formula (partial fractions):**
```
1/(P(1-P)) = 1/P + 1/(1-P)
```

**Example:** `dP/dt = P - P^2`
- Solution: `P(t) = Ce^t / (1 + Ce^t)` or `P(t) = 1/(1 + Ce^{-t})`

**Example IVP:** `dx/dt = 4(x^2 + 1), x(π/4) = 1`
- Solution: `x(t) = tan(4t - 3π/4)`

### 2C. Linear First Order Equations

**Form:** `dy/dx + p(x)y = f(x)`

**Method: Integrating Factor**
1. Compute integrating factor: `μ(x) = e^(∫ p(x)dx)`
2. Multiply both sides by `μ(x)`: `d/dx [μ(x)y] = μ(x)f(x)`
3. Integrate both sides: `μ(x)y = ∫ μ(x)f(x)dx`
4. Solve for `y`
5. For IVPs, use initial condition to find the constant

**Example:** `xy' + y = ex, y(1) = 2`
- Normalize: `y' + (1/x)y = e^x/x`
- Integrating factor: `μ = e^(∫ 1/x dx) = x`
- Solution: `y = e^x/x + (2-e)/x`

### 2D. Modeling Applications (First Order DEs)

**Newton's Law of Cooling/Warming:**
```
dT/dt = -k(T - T_env)
```
Rate of change of temperature is proportional to the difference between object and environment temperature.

**Mixture Problems:**
- Input rate of substance - Output rate of substance = d(amount)/dt
- Example: Tank with salt water where brine enters and mixed solution leaves

**Equilibrium Solutions (Autonomous DEs):**
- For `dy/dx = f(y)`, equilibrium solutions are `f(y) = 0`
- Classify as: asymptotically stable, unstable, or semi-stable
- (Lamar: Equilibrium Solutions section)

**Euler's Method (Numerical Approximation):**
```
y_{n+1} = y_n + h * f(x_n, y_n)
```
Step size `h` controls accuracy.

---

## 3. Second Order Linear Differential Equations

### 3A. Homogeneous Equations with Constant Coefficients

**Form:** `ay'' + by' + cy = 0`

**Characteristic Equation:** `am^2 + bm + c = 0`

**Three cases based on roots:**

| Case | Roots | General Solution |
|------|-------|------------------|
| 1 | Two distinct real roots `m1, m2` | `y = c1*e^(m1x) + c2*e^(m2x)` |
| 2 | Repeated real root `m` | `y = c1*e^(mx) + c2*x*e^(mx)` |
| 3 | Complex conjugate `α ± βi` | `y = e^(αx)[c1*cos(βx) + c2*sin(βx)]` |

**Example:** `y'' - y = 0` → `m^2 - 1 = 0` → `m = ±1` → `y = c1e^x + c2e^(-x)`

### 3B. Non-Homogeneous Equations: Undetermined Coefficients

**Form:** `ay'' + by' + cy = g(x)`

**Steps:**
1. Solve associated homogeneous DE → **complementary solution** `yc = c1y1 + c2y2`
2. Guess a particular solution `yp` based on `g(x)`:
   - `g(x)` = polynomial → `yp` = polynomial
   - `g(x)` = exponential → `yp` = same exponential
   - `g(x)` = cos(kx) or sin(kx) → `yp` = A*cos(kx) + B*sin(kx)
3. **Modify `yp` if it appears in `yc`** (multiply by `x`)
4. General solution: `y = yc + yp`
5. For IVPs, use initial conditions to find `c1, c2`

**Example:** `y'' - y = 2e^(-x) - 2x^2`
- `yc = c1e^x + c2e^(-x)`
- Since `e^(-x)` is in `yc`, guess `yp = Axe^(-x) + Bx^2 + Cx + D`
- Result: `y = c1e^x + c2e^(-x) - xe^(-x) + 2x^2 + 4`

### 3C. Non-Homogeneous Equations: Variation of Parameters

**Form:** `y'' + (b/a)y' + (c/a)y = g(x)/a`

**Steps:**
1. Solve homogeneous DE → `yc = c1y1 + c2y2`
2. Compute Wronskian: `W(y1,y2) = y1y2' - y2y1'`
3. Particular solution:
   ```
   u1' = -y2g/(aW),   u2' = y1g/(aW)
   u1 = ∫u1'dx,   u2 = ∫u2'dx
   yp = u1y1 + u2y2
   ```
4. General solution: `y = yc + yp`

**Example (from CSUN):** `x^2y'' + xy' - (x^2 - 1/4)y = x^(3/2)`
- Fundamental set: `{x^(-1/2)cos x, x^(-1/2)sin x}`
- Wronskian: `W = x^(-1)`
- Result: `yp = x^(-1/2)`, General: `y = c1x^(-1/2)cos x + c2x^(-1/2)sin x + x^(-1/2)`

### 3D. The Spring-Mass Model

**Form:** `mx'' + βx' + kx = f(t)`

| Parameter | Meaning | Units |
|-----------|---------|-------|
| `m` | mass | kg |
| `β` | damping constant | N·s/m |
| `k` | spring constant | N/m |
| `f(t)` | driven force | N |

**Behavior depends on damping:**
- **Underdamped:** Oscillatory decay (`β^2 - 4mk < 0`)
- **Critically damped:** Fastest non-oscillatory return (`β^2 - 4mk = 0`)
- **Overdamped:** Non-oscillatory return (`β^2 - 4mk > 0`)

**Example:** `1 kg mass, k = 5 N/m, β = 2 N·s/m, released from equilibrium with downward velocity 2 m/s`
- IVP: `x'' + 2x' + 5x = 0, x(0) = 0, x'(0) = 2`
- Solution: `x(t) = e^(-t)sin(2t)`
- Oscillates with period `π`, decaying amplitude `e^(-t)`

---

## 4. Laplace Transforms

**Definition:**
```
L{f(t)} = ∫(∞→0) e^(-st)f(t)dt
```

**Key Formulas:**
- `L{1} = 1/s`
- `L{t^n} = n!/s^(n+1)`
- `L{e^(at)} = 1/(s-a), s > a`
- `L{sin(kt)} = k/(s^2 + k^2)`
- `L{cos(kt)} = s/(s^2 + k^2)`
- `L{e^(at)f(t)} = F(s-a)` (frequency shifting)

**Derivatives:**
- `L{y'} = sY(s) - y(0)`
- `L{y''} = s^2Y(s) - sy(0) - y'(0)`

**Solving IVPs:**
1. Take Laplace transform of both sides
2. Solve algebraic equation for Y(s)
3. Take inverse Laplace transform → y(t)
4. Use partial fractions as needed

**Example (from CSUN):** `y'' + y = √2 sin(√2t), y(0) = 10, y'(0) = 0`
- Take LT: `s^2Y - 10s + Y = 2/(s^2+2)`
- Solve: `Y = 2/[(s^2+1)(s^2+2)] + 10s/(s^2+1)`
- Partial fractions: `2/(s^2+1)(s^2+2) = 2/(s^2+1) - 2/(s^2+2)`
- Result: `y(t) = 2sin(t) - √2 sin(√2t) + 10cos(t)`

---

## 5. First Order Linear Differential Systems

**Form:** 
```
dx/dt = ax + by
dy/dt = cx + dy
```

**Matrix form:** `X' = AX` where `A = [[a, b], [c, d]]`

**Solution method via eigenvalues/eigenvectors:**

| Case | Eigenvalues | General Solution |
|------|-----------|------------------|
| 1 | Two distinct real `λ1, λ2` with eigenvectors `K1, K2` | `X = c1e^(λ1t)K1 + c2e^(λ2t)K2` |
| 2 | Repeated real `λ` with eigenvector `K` and generalized eigenvector `P` | `X = c1e^(λt)K + c2[te^(λt)K + e^(λt)P]` |
| 3 | Complex conjugate `α ± βi` with complex eigenvector `K = B1 + iB2` | `X = e^(αt)[c1(cos(βt)B1 - sin(βt)B2) + c2(cos(βt)B2 + sin(βt)B1)]` |

**Example (from CSUN):** `x' = x + 2y, y' = 4x + 3y`
- Matrix: `A = [[1, 2], [4, 3]]`
- `det(A-λI) = λ^2 - 4λ - 5 = (λ+1)(λ-5)`
- `λ1 = -1, λ2 = 5`
- `K1 = [-1, 1]^T, K2 = [1, 2]^T`
- General: `X = c1e^(-t)[-1, 1]^T + c2e^(5t)[1, 2]^T`

---

## 6. Systems of Differential Equations

### Eigenvalue Method for Systems

**Find eigenvalues:** `det(A - λI) = 0`

**Find eigenvectors:** Solve `(A - λI)K = 0`

**Example:** `x' = 2x + 4y, y' = -x + 6y`
- `A = [[2, 4], [-1, 6]]`
- `det(A-λI) = λ^2 - 8λ + 16 = (λ-4)^2`
- Repeated eigenvalue `λ = 4`
- Eigenvector `K = [2, 1]^T`
- Generalized eigenvector `P = [1, 1]^T`
- General solution: `X = c1e^(4t)[2, 1]^T + c2[te^(4t)[2, 1]^T + e^(4t)[1, 1]^T]`

### Complex Eigenvalues in Systems

**Example:** `x' = 6x - y, y' = 5x + 4y`
- `A = [[6, -1], [5, 4]]`
- `det(A-λI) = λ^2 - 10λ + 29 = (λ-5)^2 + 4`
- `λ1 = 5+2i, λ2 = 5-2i`
- Eigenvector: `K = [1, 1-2i]^T = [1, 1]^T + i[0, -2]^T`
- Real vectors: `B1 = [1, 1]^T, B2 = [0, -2]^T`
- General solution:
  ```
  X = c1e^(5t)[cos(2t), cos(2t) + 2sin(2t)]^T
      + c2e^(5t)[sin(2t), -2cos(2t) + sin(2t)]^T
  ```

---

## 7. Additional Topics

### Intervals of Validity
- For IVPs, the interval of validity contains the initial point `x0`
- Must be a region where the solution and its derivatives are defined
- Existence and uniqueness theorems guarantee a unique solution under certain conditions

### Equilibrium Solutions (Autonomous Systems)
- For `y' = f(y)`, find `f(y) = 0`
- Classify stability:
  - **Asymptotically stable:** `f'(y) < 0` at equilibrium
  - **Unstable:** `f'(y) > 0` at equilibrium
  - **Semi-stable:** Sign change in `f'(y)`

### Direction Fields
- Sketch direction segments at grid points `(x, y)` with slope `f(x, y)`
- Useful for visualizing solution behavior without solving analytically

### Bernoulli Equations
- Form: `y' + p(x)y = q(x)y^n`
- Substitution: `v = y^(1-n)` transforms to linear equation

### Substitutions
- `y = vx` → for equations of form `y' = F(y/x)`
- `y = ax + by` → for equations of form `y' = G(ax + by)`

---

## Study Tips

1. **Practice classifying DEs** by order and linearity before attempting to solve
2. **Master the three solution methods** for second-order constant-coefficient equations:
   - Characteristic equation for homogeneous
   - Undetermined coefficients for specific `g(x)` forms
   - Variation of parameters for general `g(x)`
3. **Learn the Laplace transform table** cold — it's the fastest way to solve IVPs
4. **Practice eigenvector/eigenvalue problems** for systems — the pattern is consistent
5. **Check your solutions** by differentiating and substituting back into the original DE
6. **For IVPs always use initial conditions** to determine constants (this is where point deductions happen!)
7. **Draw phase portraits** when possible — visualizing behavior is key for equilibrium and system analysis

---

## References

- **CSUN Study Guide:** https://www.csun.edu/~xiaolong/Guide_MATH351.pdf (Topics 0-4, organized by exam topics)
- **Paul's Notes (Lamar University):** https://tutorial.math.lamar.edu/classes/de/de.aspx (Complete course notes)
- **Textbook:** Zill, *A First Course in Differential Equations*, 11th Edition (referenced throughout both guides)

---
*Study guide created using resources from CSUN and Lamar University differential equations courses.*