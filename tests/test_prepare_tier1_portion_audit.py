"""Synthetic selection contracts: no source downloads or inference."""
import unittest
from tool.prepare_tier1_public_eval import date_of
from tool.prepare_tier1_portion_audit import select_portion_audit


def dish(day,kcal,offset=0):
    identity=f'dish_{1550000000+day*86400+offset}'
    vector={'kcal':kcal,'massG':100,'proteinG':5,'carbsG':10,'fatG':3}
    return {'id':identity,'captureDate':date_of(identity),'reference':vector,
            'ingredients':[{'id':'ingr_1','name':'Synthetic',**vector}]}


def sample():return [dish(i,700) for i in range(7)]+[dish(i,300) for i in range(7,14)]+[dish(i,50) for i in range(14,21)]


class SelectionTests(unittest.TestCase):
    def select(self,rows,legacy=(),recent=(),dates=()):
        return select_portion_audit(rows,{r['id'] for r in rows},set(legacy),set(recent),set(dates),{'ingr_1':'Valid'})

    def test_prespecified_energy_quotas_and_unique_dates(self):
        result=self.select(sample());cases=result['cases'];self.assertEqual(len(cases),10)
        self.assertEqual(len({r['id'] for r in cases}),10);self.assertEqual(len({r['captureDate'] for r in cases}),10)
        self.assertEqual([sum(low<=r['reference']['kcal']<high for r in cases)
                          for low,high in [(600,1000),(200,600),(0,200)]],[4,3,3])
        self.assertEqual(result['selection']['seed'],'calorix-tier1-portion-audit-20261109-v1')

    def test_source_order_does_not_change_frozen_ranked_selection(self):
        rows=sample();self.assertEqual(self.select(rows),self.select(list(reversed(rows))))

    def test_excludes_seen_ids_and_every_legacy_capture_date(self):
        rows=sample();legacy=rows[0]['id'];recent=rows[1]['id']
        extra=dish(0,900,10);rows.append(extra)
        result=self.select(rows,legacy=[legacy],recent=[recent])
        selected={r['id'] for r in result['cases']}
        self.assertTrue(selected.isdisjoint({legacy,recent,extra['id']}))
        self.assertEqual(result['selection']['recentExcludedIds'],[recent])

    def test_insufficient_distinct_high_dates_fails_without_fallback(self):
        rows=[r for r in sample() if r['reference']['kcal']<600]+[dish(0,700,i) for i in range(10)]
        with self.assertRaises(ValueError):self.select(rows)

    def test_invalid_source_row_is_excluded_and_previous_date_overlap_is_reported(self):
        rows=sample();bad=dish(25,900);bad['ingredients'][0]['id']='unknown';rows.append(bad)
        old_dates={r['captureDate'] for r in rows}
        result=self.select(rows,dates=old_dates)
        self.assertNotIn(bad['id'],{r['id'] for r in result['cases']})
        self.assertIn({'id':bad['id'],'reason':'unknown_ingredient'},result['selection']['sourceExclusions'])
        self.assertEqual(set(result['selection']['overlapWithPreviousDates']),{r['captureDate'] for r in result['cases']})
        self.assertFalse(result['selection']['independentCompletedMealsEstablished'])


if __name__=='__main__':unittest.main()
