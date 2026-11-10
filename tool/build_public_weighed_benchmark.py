"""Build the pinned 40-scan bundle from existing local receipts; never infer."""
INDEX_SHA256='2a18ef5677cf5a128f0034c3003c1dc9d56727792f4966c5988d6cd50b84dfe3'
def build(index_path,source_root,expected_sha256=INDEX_SHA256):
    raise NotImplementedError('Pinned builder follows behavioral RED')
