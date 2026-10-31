"""Developer-only offline staging. Never invoked by the installed plugin.

Inputs are previously downloaded official archives in an explicit source folder.
Archive entry checks prevent extraction outside the fresh destination. Third-party
licenses remain beside each installed wheel; this is not permission certification.
"""
from pathlib import Path
import hashlib
import json
import shutil
import sys
import zipfile

source, scorer, destination = (Path(x).resolve() for x in sys.argv[1:4])
if destination.exists():
    raise RuntimeError('Destination already exists; inspect it rather than overwrite.')
destination.mkdir(parents=True)

def extract(archive, target, prefix=None):
    with zipfile.ZipFile(archive) as content:
        for entry in content.infolist():
            if prefix and not entry.filename.startswith(prefix):
                continue
            path = (target / entry.filename).resolve()
            if not path.is_relative_to(target) or '\\' in entry.filename:
                raise RuntimeError('Unsafe archive path')
            content.extract(entry, target)

extract(source / 'python-3.13.11-embed-amd64.zip', destination)
site = destination / 'site-packages'
site.mkdir()
for wheel in sorted((source / 'wheels').glob('*.whl')):
    extract(wheel, site)
(destination / 'python313._pth').write_text('python313.zip\n.\nsite-packages\n', encoding='utf-8')
# No pretrained NLTK data is distributed. The code-only adapter is versioned.
shutil.copyfile(Path(__file__).with_name('tokenizer-adapter.py'), destination / 'tokenizer_adapter.py')
module = destination / 'instruction_following_eval'
module.mkdir()
(module / '__init__.py').write_text('', encoding='utf-8')
for name in ['instructions.py', 'instructions_registry.py', 'instructions_util.py', 'evaluation_lib.py']:
    shutil.copyfile(scorer / ('ifeval-' + name), module / name)
shutil.copyfile(scorer / 'ifeval-LICENSE', module / 'LICENSE')
wrapper = '''import json, random, sys
import langdetect
from instruction_following_eval import evaluation_lib
from tokenizer_adapter import install
install()
random.seed(0)
langdetect.DetectorFactory.seed = 0
data=json.load(sys.stdin)
example=evaluation_lib.InputExample(key=data['key'],instruction_id_list=data['instruction_id_list'],prompt=data['prompt'],kwargs=data['kwargs'])
result=evaluation_lib.test_instruction_following_strict(example,{example.prompt:data['answer']})
json.dump({'passed':result.follow_all_instructions,'instructions':result.follow_instruction_list},sys.stdout)
'''
(destination / 'grade_rules.py').write_text(wrapper, encoding='utf-8')
files = [{'path': p.relative_to(destination).as_posix(), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(destination.rglob('*')) if p.is_file()]
(destination / 'runtime.json').write_text(json.dumps({'schemaVersion': 1, 'kind': 'trusted-ifeval', 'files': files}, indent=2)+'\n', encoding='utf-8')
print('Staged trusted rule runtime:', len(files), 'files')
