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
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [existingBinned, setExistingBinned] = useState<Record<string, string[]>>({})
  const [toDelete, setToDelete] = useState<Record<string, string[]>>({})
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
      // Par défaut, aucune variable n'est sélectionnée pour éviter les créations non voulues
      const defaultsSel: Record<string, boolean> = {}
      parsedCols.forEach((c: ConcernedColumn) => (defaultsSel[c.column] = false))
      setSelected(defaultsSel)
      // Détecter les colonnes binned existantes par variable (côté client)
      try {
        const ea = JSON.parse(localStorage.getItem('excelAnalysisData') || '{}')
        const cols: string[] = Array.isArray(ea?.columns) ? ea.columns : []
        const mapped: Record<string, string[]> = {}
        parsedCols.forEach((c: ConcernedColumn) => {
          const pref = `${c.column}_bin`
          mapped[c.column] = cols.filter((col: string) => col.startsWith(pref))
        })
        setExistingBinned(mapped)
        const initDel: Record<string, string[]> = {}
        Object.keys(mapped).forEach(k => initDel[k] = [])
        setToDelete(initDel)
      } catch {}
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
        if (!selected[c.column]) continue
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
      // Suppression des anciennes colonnes sélectionnées pour suppression
      try {
        const delList = Object.values(toDelete).flat()
        if (delList.length) {
          const f = new FormData()
          f.append('filename', filename)
          f.append('columns', delList.join(','))
          await fetch(`${API_URL}/excel/drop-columns`, { method: 'POST', body: f })
        }
      } catch {}
      // Marquer le fichier comme pré-traité et poursuivre le flux normal
      localStorage.removeItem('preprocessColumns')
      try {
        if (filename) {
          localStorage.setItem(`preprocessDone:${filename}`, 'true')
        }
      } catch {}
      // Mettre à jour les listes locales (binnedColumns + columns) en tenant compte des suppressions et créations
      try {
        const delSet = new Set(Object.values(toDelete).flat())
        const existingB = JSON.parse(localStorage.getItem(`binnedColumns:${filename}`) || '[]')
        const baseB = Array.isArray(existingB) ? existingB.filter((c: string) => !delSet.has(c)) : []
        const mergedB = Array.from(new Set([...(baseB || []), ...created]))
        localStorage.setItem(`binnedColumns:${filename}`, JSON.stringify(mergedB))
      } catch {}

      try {
        const existingEA = JSON.parse(localStorage.getItem('excelAnalysisData') || '{}')
        if (existingEA && Array.isArray(existingEA.columns)) {
          const delSet = new Set(Object.values(toDelete).flat())
          const base = (existingEA.columns || []).filter((c: string) => !delSet.has(c))
          const updatedCols = Array.from(new Set([...(base || []), ...created]))
          existingEA.columns = updatedCols
          localStorage.setItem('excelAnalysisData', JSON.stringify(existingEA))
        }
      } catch {}
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
                    <div className="flex items-center gap-2">
                      <input
                        id={`sel-${c.column}`}
                        type="checkbox"
                        checked={!!selected[c.column]}
                        onChange={(e) => setSelected((p) => ({ ...p, [c.column]: e.target.checked }))}
                      />
                      <label htmlFor={`sel-${c.column}`} className="text-sm">Activer</label>
                    </div>
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
                        disabled={!selected[c.column]}
                      />
                    </div>
                    <div className="flex-1 min-w-[240px]">
                      <label className="block text-sm text-gray-600">Nom de la nouvelle variable</label>
                      <input
                        type="text"
                        value={newNames[c.column] || ''}
                        onChange={(e) => setNewNames((p) => ({ ...p, [c.column]: e.target.value }))}
                        className="border rounded px-3 py-2 w-full"
                        disabled={!selected[c.column]}
                      />
                    </div>
                </div>
                {existingBinned[c.column] && existingBinned[c.column].length > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <div className="text-sm font-medium mb-2">Nettoyer les anciennes colonnes à intervalles</div>
                    <div className="flex flex-wrap gap-3">
                      {existingBinned[c.column].map((bn) => {
                        const checked = (toDelete[c.column] || []).includes(bn)
                        return (
                          <label key={bn} className={`text-xs px-2 py-1 rounded-full border ${checked ? 'bg-red-50 border-red-300 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                            <input
                              type="checkbox"
                              className="mr-1 align-middle"
                              checked={checked}
                              onChange={(e) => setToDelete((p) => {
                                const cur = new Set(p[c.column] || [])
                                if (e.target.checked) cur.add(bn); else cur.delete(bn)
                                return { ...p, [c.column]: Array.from(cur) }
                              })}
                            />
                            {bn}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
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


