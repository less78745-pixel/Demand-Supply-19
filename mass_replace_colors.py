import os

files = [
    'frontend/src/components/charts/ForecastChart.tsx',
    'frontend/src/app/scm-analytic/control-tower/page.tsx',
    'frontend/src/app/scm-analytic/safety-stock/page.tsx',
    'frontend/src/app/scm-analytic/rebalancing/page.tsx',
    'frontend/src/app/scm-analytic/landed-cost/page.tsx',
    'frontend/src/app/dashboard/page.tsx'
]

for f in files:
    if not os.path.exists(f):
        print(f"File not found: {f}")
        continue
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Replace in SVG attributes
    content = content.replace('fill="hsl(var(--muted-foreground))"', 'fill="#475569"')
    content = content.replace('stroke="hsl(var(--muted-foreground))"', 'stroke="#475569"')
    
    # Replace in React tick props
    content = content.replace("tick={{ fill: 'hsl(var(--muted-foreground))',", "tick={{ fill: '#475569',")
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)
print('Mass replacement complete.')
