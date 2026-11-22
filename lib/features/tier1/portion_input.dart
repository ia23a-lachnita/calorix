/// The amount and share supplied by the user, plus the scale used for this food.
/// Keeping the scale with the entry makes historical calculations reproducible.
class PortionInput {
  PortionInput(
      {required this.unit,
      required this.amount,
      required this.numerator,
      required this.denominator,
      required this.referenceAmount,
      required this.referenceGrams,
      required this.referenceSource}) {
    if (!{'pieces', 'ml', 'batch'}.contains(unit) ||
        !amount.isFinite ||
        amount < 0 ||
        amount > 100000 ||
        numerator < 0 ||
        denominator <= 0 ||
        numerator > denominator ||
        denominator > 100000 ||
        !referenceAmount.isFinite ||
        referenceAmount <= 0 ||
        !referenceGrams.isFinite ||
        referenceGrams <= 0 ||
        !grams.isFinite ||
        grams < 0 ||
        grams > 100000) {
      throw ArgumentError('Invalid food quantity or reference');
    }
    if (referenceSource == 'user') return;
    if (referenceSource == 'photo' &&
        unit == 'batch' &&
        referenceAmount == 1 &&
        amount == 1) {
      return;
    }
    final reference = householdReferences[referenceSource];
    if (reference == null ||
        reference.unit != unit ||
        referenceAmount != reference.amount ||
        referenceGrams != reference.grams) {
      throw ArgumentError('Invalid food quantity reference');
    }
  }
  final String unit, referenceSource;
  final double amount, referenceAmount, referenceGrams;
  final int numerator, denominator;
  double get grams =>
      amount * numerator / denominator * referenceGrams / referenceAmount;
  Map<String, dynamic> toJson() => {
        'unit': unit,
        'amount': amount,
        'numerator': numerator,
        'denominator': denominator,
        'referenceAmount': referenceAmount,
        'referenceGrams': referenceGrams,
        'referenceSource': referenceSource
      };
  factory PortionInput.fromJson(Map<String, dynamic> value) => PortionInput(
      unit: value['unit'] as String,
      amount: (value['amount'] as num).toDouble(),
      numerator: value['numerator'] as int,
      denominator: value['denominator'] as int,
      referenceAmount: (value['referenceAmount'] as num).toDouble(),
      referenceGrams: (value['referenceGrams'] as num).toDouble(),
      referenceSource: value['referenceSource'] as String);
  bool sameAs(PortionInput? other) =>
      other != null &&
      unit == other.unit &&
      amount == other.amount &&
      numerator == other.numerator &&
      denominator == other.denominator &&
      referenceAmount == other.referenceAmount &&
      referenceGrams == other.referenceGrams &&
      referenceSource == other.referenceSource;
}

typedef HouseholdReference = ({
  String unit,
  double amount,
  double grams,
  String description
});

/// USDA SR Legacy food_portion.csv, published 2018-04, archived SHA256
/// b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0.
/// Sources are specific to preparation and edible portion. The milk record is
/// 30.5 grams per US fluid ounce (29.5735295625 millilitres).
const householdReferences = <String, HouseholdReference>{
  'usda:173424': (
    unit: 'pieces',
    amount: 1.0,
    grams: 50.0,
    description: 'One large hard-boiled egg, 50 g (USDA row 92500)'
  ),
  'usda:172186': (
    unit: 'pieces',
    amount: 1.0,
    grams: 50.0,
    description: 'One large poached egg, 50 g (USDA row 90049)'
  ),
  'usda:172187': (
    unit: 'pieces',
    amount: 1.0,
    grams: 61.0,
    description: 'One large scrambled egg, 61 g (USDA row 90050)'
  ),
  'usda:173423': (
    unit: 'pieces',
    amount: 1.0,
    grams: 46.0,
    description: 'One large fried egg, 46 g (USDA row 92497)'
  ),
  'usda:172185': (
    unit: 'pieces',
    amount: 1.0,
    grams: 61.0,
    description: 'One large omelet egg, 61 g (USDA row 90048)'
  ),
  'usda:171265': (
    unit: 'ml',
    amount: 29.5735295625,
    grams: 30.5,
    description: 'Whole milk, 30.5 g per US fluid ounce (USDA row 88315)'
  ),
};
