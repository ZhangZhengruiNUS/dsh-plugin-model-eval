"""Developer-only pinned-Parquet projection. Never part of installed runtime."""
import hashlib
import json
from pathlib import Path
import sys
import pyarrow
import pyarrow.parquet as parquet

source, destination, kind = sys.argv[1:]
rows = []
for batch in parquet.ParquetFile(source).iter_batches(batch_size=16):
    for original in batch.to_pylist():
        encoded = json.dumps(original, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
        if kind == 'coding':
            keys = ['name', 'description', 'time_limit', 'memory_limit_bytes', 'source', 'difficulty', 'cf_contest_id', 'cf_index', 'cf_points', 'cf_rating', 'public_tests', 'private_tests', 'generated_tests']
            row = {key: original.get(key) for key in keys}
            solutions = original.get('solutions') or {}
            row['python3_references'] = [code for language, code in zip(solutions.get('language', []), solutions.get('solution', [])) if language == 3][:3]
        elif kind == 'knowledge':
            row = {key: original.get(key) for key in ['question_id', 'question', 'options', 'answer', 'answer_index', 'category', 'src']}
        else:
            row = {key: value for key, value in original.items() if not key.startswith('image_')}
        row['_source_record_sha256'] = hashlib.sha256(encoded).hexdigest()
        rows.append(row)
Path(destination).write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
print(json.dumps({'rows': len(rows), 'pyarrow': pyarrow.__version__, 'python': sys.version.split()[0]}))
