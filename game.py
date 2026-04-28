#!/usr/bin/env python3
"""
文字游戏框架 - 简易启动器
将系统提示词和配置组合发送给兼容的 API
"""

import json
import sys

def load_system_prompt():
    with open("SYSTEM_PROMPT.md", "r", encoding="utf-8") as f:
        return f.read()

def load_game_config():
    with open("game-config.json", "r", encoding="utf-8") as f:
        return json.load(f)

def build_full_prompt(system_prompt, config):
    """组合完整提示词"""
    world_info = f"""
【游戏配置】
当前日期：{config['game']['startDate']} {config['game']['startTime']}
当前地点：{config['game']['defaultLocation']}

【可用关键词触发器】
时间类：{', '.join(config['triggers']['timeAdvance'])}
探索类：{', '.join(config['triggers']['exploration'])}
战斗类：{', '.join(config['triggers']['combat'])}
交易类：{', '.join(config['triggers']['trade'])}
对话类：{', '.join(config['triggers']['talk'])}
系统类：{', '.join(config['triggers']['system'])}

【初始游戏状态】
请以此为基础开始游戏，用第二人称描述玩家醒来后发现的情景。
"""
    return system_prompt + "\n\n" + world_info

def main():
    print("=" * 50)
    print("开放世界文字游戏框架")
    print("=" * 50)

    system_prompt = load_system_prompt()
    config = load_game_config()
    full_prompt = build_full_prompt(system_prompt, config)

    print(f"\n提示词已构建，总长度：{len(full_prompt)} 字符")
    print(f"初始状态：{config['game']['startDate']} {config['game']['startTime']}")
    print(f"初始地点：{config['game']['defaultLocation']}")

    print("\n" + full_prompt)

    # 如果有 API 相关参数，可以在这里处理
    # 例如：发送给 Claude API / OpenAI API 等

if __name__ == "__main__":
    main()
