import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SlidersHorizontal } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { showSaveFailedToast, showSavedToast } from '@/lib/save-toasts'
import { storeSavedMonth, updateMonthTargets, type Month } from '@/months/months-api'
import { BucketPercentagesForm } from '@/spending-plan/bucket-percentages-form'
import type { SpendingPlanPercentages } from '@/spending-plan/spending-plan-api'
import { monthSummaryQueryKey } from '@/summary/summary-api'

interface MonthTargetsEditorProps {
  /** A month the user has started. */
  month: Month
}

/**
 * An "Adjust this month's plan" button that opens a form for the month's bucket percentages. Saving
 * it changes only this month: the spending plan and the other months keep their targets.
 */
export function MonthTargetsEditor({ month }: MonthTargetsEditorProps) {
  const queryClient = useQueryClient()
  const headingId = useId()
  const [isEditing, setIsEditing] = useState(false)
  const saveMutation = useMutation({
    mutationFn: (newTargets: SpendingPlanPercentages) => updateMonthTargets(month, newTargets),
    onSuccess: async (updatedMonth) => {
      showSavedToast('Targets saved')
      await storeSavedMonth(queryClient, updatedMonth)
      // The summary's target amounts come from the percentages.
      void queryClient.invalidateQueries({ queryKey: monthSummaryQueryKey(month) })
      setIsEditing(false)
    },
    // The form stays open with what the user typed, to try again.
    onError: showSaveFailedToast,
  })

  function startEditing() {
    saveMutation.reset()
    setIsEditing(true)
  }

  if (!isEditing) {
    return (
      <Button variant="outline" size="sm" onClick={startEditing}>
        <SlidersHorizontal />
        Adjust this month's plan
      </Button>
    )
  }

  return (
    <section aria-labelledby={headingId} className="w-full space-y-4">
      <div className="space-y-1">
        <h3 id={headingId} className="font-semibold">
          This month's plan
        </h3>
        <p className="text-sm text-muted-foreground">
          Changes only this month. Your spending plan and other months stay as they are.
        </p>
      </div>
      <BucketPercentagesForm
        initialPercentages={month}
        onSave={saveMutation.mutate}
        isSaving={saveMutation.isPending}
        submitLabel="Save this month's plan"
        previewIncome={month.income}
        onCancel={() => setIsEditing(false)}
      />
    </section>
  )
}
