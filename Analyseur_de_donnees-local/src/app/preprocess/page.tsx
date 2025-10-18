"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import StepProgress from "@/components/ui/step-progress"
import { API_URL } from "@/lib/api"

interface ConcernedColumn {
  column: string
  is_numeric: boolean
  unique_count: number
  min: number | null
  max: number | null
}

export default function PreprocessPage() {
  const router = useRouter()
  const [filename, setFilename] = useState<string | null>(null)
  const [concerned, setConcerned] = useState<ConcernedColumn[]>([])
  const [binSizes, setBinSizes] = useState<Record<string, string>>({})
  const [newNames, setNewNames] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    try {
      const data = localStorage.getItem('excelAnalysisData')
      const cols = localStorage.getItem('preprocessColumns')
      if (!data || !cols) {
        router.push('/variables')
        return
      }
      const parsed = JSON.parse(data)
      const parsedCols = JSON.parse(cols)
      if (!parsed?.filename || !Array.isArray(parsedCols)) {
        router.push('/variables')
        return
      }
      setFilename(parsed.filename)
      setConcerned(parsedCols)
      // Pré-remplir binSizes et newNames
      const defaultSizes: Record<string, string> = {}
      const defaultsNames: Record<string, string> = {}
      parsedCols.forEach((c: ConcernedColumn) => {
        defaultSizes[c.column] = "5"
        defaultsNames[c.column] = `${c.column}_bin_5`
      })
      setBinSizes(defaultSizes)
      setNewNames(defaultsNames)
    } catch {
      router.push('/variables')
    }
  }, [router])

  const hasColumns = useMemo(() => concerned.length > 0, [concerned])

  const applyBinning = async () => {
    if (!filename) return
    setSubmitting(true)
    try {
      const created: string[] = []
      for (const c of concerned) {
        const size = parseFloat(binSizes[c.column] || '0')
        if (!size || size <= 0) continue
        const form = new FormData()
        form.append('filename', filename)
        form.append('source_column', c.column)
        form.append('bin_size', String(size))
        if (newNames[c.column]) form.append('new_column_name', newNames[c.column])
        const resp = await fetch(`${API_URL}/excel/bin-variable`, { method: 'POST', body: form })
        if (!resp.ok) {
          // on continue quand même pour les autres colonnes
          continue
        }
        try {
          const j = await resp.json()
          if (j?.new_column) created.push(j.new_column)
        } catch {}
      }
      // Marquer le fichier comme pré-traité et poursuivre le flux normal
      localStorage.removeItem('preprocessColumns')
      try {
        if (filename) {
          localStorage.setItem(`preprocessDone:${filename}`, 'true')
        }
      } catch {}
      if (created.length) {
        try {
          const existing = JSON.parse(localStorage.getItem('binnedColumns') || '[]')
          const merged = Array.from(new Set([...(Array.isArray(existing) ? existing : []), ...created]))
          localStorage.setItem('binnedColumns', JSON.stringify(merged))
          // Mettre à jour la liste des colonnes connue côté client pour l'écran suivant
          const existingEA = JSON.parse(localStorage.getItem('excelAnalysisData') || '{}')
          if (existingEA && Array.isArray(existingEA.columns)) {
            const updatedCols = Array.from(new Set([...(existingEA.columns || []), ...created]))
            existingEA.columns = updatedCols
            localStorage.setItem('excelAnalysisData', JSON.stringify(existingEA))
          }
        } catch {
          localStorage.setItem('binnedColumns', JSON.stringify(created))
          try {
            const existingEA = JSON.parse(localStorage.getItem('excelAnalysisData') || '{}')
            if (existingEA && Array.isArray(existingEA.columns)) {
              const updatedCols = Array.from(new Set([...(existingEA.columns || []), ...created]))
              existingEA.columns = updatedCols
              localStorage.setItem('excelAnalysisData', JSON.stringify(existingEA))
            }
          } catch {}
        }
      }
      router.push('/variables')
    } catch {
      setSubmitting(false)
    }
  }

  if (!hasColumns) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 p-8">
        <StepProgress currentStep={2} />
        <div className="max-w-3xl mx-auto text-center">
          <p>Aucune variable à discrétiser. Redirection…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 p-8">
      <StepProgress currentStep={2} />
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-6 bg-emerald-600 bg-clip-text text-transparent">
          Pré-traitement: création d'intervalles
        </h1>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Variables numériques avec beaucoup de valeurs distinctes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {concerned.map((c) => (
                <div key={c.column} className="border rounded p-4">
                  <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-sm text-gray-600">Variable</label>
                      <div className="font-medium">{c.column}</div>
                      <div className="text-xs text-gray-500">unique: {c.unique_count} • min: {c.min ?? '-'} • max: {c.max ?? '-'}</div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600">Taille d'intervalle</label>
                      <input
                        type="number"
                        min={0.000001}
                        step={0.000001}
                        value={binSizes[c.column] || ''}
                        onChange={(e) => setBinSizes((p) => ({ ...p, [c.column]: e.target.value }))}
                        className="border rounded px-3 py-2 w-40"
                      />
                    </div>
                    <div className="flex-1 min-w-[240px]">
                      <label className="block text-sm text-gray-600">Nom de la nouvelle variable</label>
                      <input
                        type="text"
                        value={newNames[c.column] || ''}
                        onChange={(e) => setNewNames((p) => ({ ...p, [c.column]: e.target.value }))}
                        className="border rounded px-3 py-2 w-full"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <Button variant="outline" onClick={() => { localStorage.removeItem('preprocessColumns'); router.push('/variables') }}>Ignorer</Button>
              <Button onClick={applyBinning} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting ? 'Application…' : 'Créer les variables et continuer'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


