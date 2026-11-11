"""Reference-blind research selector; never a production default."""
import math
import re
from collections.abc import Mapping

from tool.calorie_lens_routes import finite, route_specialist, vector

# Explicit lexical identity aliases, not verified nutrient equivalences. Specific
# phrases occupy their spans before short aliases (egg whites must not be eggs).
ALIASES = {
    'rice': ('rice', 'white rice', 'brown rice', 'wild rice'),
    'fried_rice': ('fried rice',), 'rice_noodles': ('rice noodles',),
    'chicken': ('chicken', 'chicken breast', 'chicken thighs', 'grilled chicken', 'roast chicken'),
    'chicken_salad': ('chicken salad',), 'chicken_sausage': ('chicken apple sausage',),
    'beef': ('beef', 'steak', 'beef steak', 'brisket'),
    'turkey': ('turkey', 'ground turkey'), 'turkey_bacon': ('turkey bacon',),
    'bacon': ('bacon',), 'pork': ('pork',), 'ham': ('ham',), 'sausage': ('sausage',),
    'egg_whites': ('egg whites', 'egg white'), 'eggs': ('eggs', 'egg', 'poached eggs'),
    'scrambled_eggs': ('scrambled eggs',), 'omelet': ('omelet', 'omelets', 'omelette'),
    'sweet_potato': ('sweet potato', 'sweet potatoes', 'yam', 'yams'),
    'potato': ('potato', 'potatoes', 'roasted potatoes'),
    'mashed_potato': ('mashed potatoes', 'mashed potato'),
    'hash_browns': ('hash brown', 'hash browns'), 'potato_chips': ('potato chips',),
    'tuna': ('tuna',), 'tuna_salad': ('tuna salad',), 'salmon': ('salmon',),
    'fish': ('fish',), 'cod': ('cod',), 'shrimp': ('shrimp',), 'tofu': ('tofu',),
    'pasta': ('pasta', 'spaghetti', 'noodles', 'macaroni'), 'pasta_salad': ('pasta salad',),
    'pizza': ('pizza', 'cheese pizza'), 'pepperoni_pizza': ('pepperoni pizza',),
    'bread': ('bread', 'wheat bread', 'multigrain bread', 'sourdough bread'),
    'flatbread': ('flatbread', 'pita bread'), 'quinoa': ('quinoa',),
    'couscous': ('couscous',), 'wheat_berry': ('wheat berry', 'wheat berries'),
    'broccoli': ('broccoli',), 'cauliflower': ('cauliflower',),
    'carrot': ('carrot', 'carrots', 'baby carrots'),
    'tomato': ('tomato', 'tomatoes', 'cherry tomato', 'cherry tomatoes', 'grape tomato', 'grape tomatoes'),
    'spinach': ('spinach',), 'mixed_greens': ('mixed greens', 'mixed green salad'),
    'lettuce': ('lettuce',), 'arugula': ('arugula',), 'kale': ('kale',),
    'green_beans': ('green beans', 'green bean'), 'cucumber': ('cucumber', 'cucumbers'),
    'zucchini': ('zucchini',), 'eggplant': ('eggplant',), 'squash': ('squash',),
    'mushroom': ('mushroom', 'mushrooms'), 'onion': ('onion', 'onions'),
    'bell_pepper': ('bell pepper', 'bell peppers'), 'corn': ('corn', 'corn on the cob'),
    'avocado': ('avocado',), 'apple': ('apple', 'apples'), 'grapes': ('grape', 'grapes'),
    'almonds': ('almond', 'almonds'), 'walnuts': ('walnut', 'walnuts'),
    'berries': ('berries', 'berry', 'blueberries', 'blackberries', 'raspberries', 'strawberries'),
    'banana': ('banana', 'bananas'), 'orange': ('orange', 'oranges'),
    'olive_oil': ('olive oil',), 'oil': ('oil', 'vegetable oil'),
    'salsa': ('salsa', 'salsa verde'), 'gravy': ('gravy',),
    'cheese': ('cheese',), 'cream_cheese': ('cream cheese',),
}
THRESHOLD = .8
DESCRIPTORS = frozenset(('steamed boiled hard roasted grilled baked cooked raw fresh whole '
                         'sliced diced chopped shredded florets chunks cubes strips leaves '
                         'baby plain seasoned sauteed and with of a the red green yellow mixed').split())


def food_groups(name):
    if not isinstance(name, str) or re.search(r'\b(or|versus|vs)\b|/', name, re.I):
        return frozenset()
    text = ' '.join(re.findall(r'[a-z0-9]+', name.casefold()))
    hits = []
    for group, aliases in ALIASES.items():
        for alias in aliases:
            for match in re.finditer(r'(?<!\w)' + re.escape(alias) + r'(?!\w)', text):
                hits.append((match.start(), match.end(), group))
    occupied = set(); groups = set()
    for start, end, group in sorted(hits, key=lambda hit: (-(hit[1]-hit[0]), hit[0], hit[2])):
        span = set(range(start, end))
        if not span & occupied:
            occupied.update(span); groups.add(group)
    remainder = ''.join(' ' if i in occupied else ch for i, ch in enumerate(text))
    if set(remainder.split())-DESCRIPTORS:
        return frozenset()  # A known word cannot account for an unknown mixed dish.
    return frozenset(groups)


def route_food_agreement(a1, specialist):
    """Select using perception fields only; unknowns stay in mass denominators.

    Additional mapping keys are deliberately never enumerated or accessed. The
    caller keeps original records separately; no reference or case ID is needed.
    """
    if not isinstance(a1, Mapping):
        a1 = None
    if a1 and a1.get('status', 'ok') != 'ok':
        a1 = None
    base = route_specialist(a1, None)
    result = {**base, 'identityAndPortionVerified': False, 'referenceUsed': False,
              'agreement': None, 'selectorVersion': 'food-agreement-v1'}
    if base['status'] != 'ok' or not base['eligible']:
        return result
    result['reason'] = 'specialist_failed_or_invalid'
    try:
        if not isinstance(specialist, Mapping) or specialist.get('status') != 'ok':
            return result
        candidate = vector(specialist)
        summary = specialist['publisherSummary']
        total = finite(summary['totals']['mass_g'], True)
        other = finite(summary['other']['grams'])
        ingredients = summary['ingredients']
        if not isinstance(ingredients, list) or not ingredients or len(ingredients) > 12:
            return result
        named = []; names = set()
        for row in ingredients:
            name = row['name']
            if not isinstance(name, str) or not name.strip() or name.casefold() in names:
                return result
            names.add(name.casefold())
            grams = finite(row['grams'], True)
            confidence = finite(row['confidence'])
            if not .65 <= confidence <= 1:
                return result
            named.append((food_groups(name), grams))
        named_mass = math.fsum(g for _, g in named)
        if abs(candidate['massG']-total) > 1 or abs(named_mass+other-total) > 1:
            return result
        a_parts = [(food_groups(c['name']), finite(c['massG'], True)) for c in a1['components']]
    except (KeyError, TypeError, ValueError, AttributeError, OverflowError):
        return result
    a_groups = frozenset().union(*(groups for groups, _ in a_parts))
    s_groups = frozenset().union(*(groups for groups, _ in named))
    matches = a_groups & s_groups
    # A composite A1 row is covered only if every recognized identity agrees.
    a_mass = math.fsum(g for groups, g in a_parts if groups and groups <= s_groups)
    s_mass = math.fsum(g for groups, g in named if groups and groups <= a_groups)
    agreement = {'matchedGroups': sorted(matches),
                 'a1MatchedMassFraction': a_mass/base['massG'],
                 'specialistNamedMassFraction': named_mass/candidate['massG'],
                 'specialistMatchedMassFraction': s_mass/candidate['massG']}
    result.update(agreement=agreement, reason='food_or_coverage_disagreement')
    if len(matches) >= 2 and all(agreement[k] >= THRESHOLD for k in (
            'a1MatchedMassFraction', 'specialistNamedMassFraction', 'specialistMatchedMassFraction')):
        result.update(candidate, selectedSource='specialist', reason='food_and_portion_agreement',
                      nutrientSourceKind=specialist.get('nutrientSourceKind', 'unverified_published_model_estimate'))
    return result
