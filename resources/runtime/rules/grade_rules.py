import json, random, sys
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
