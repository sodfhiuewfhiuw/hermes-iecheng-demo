# HERMES Adaptive Narrative Generation

## Principle

Do not force every short video into the same conflict-reversal-answer formula.
The model must first choose the dramatic mechanism, then generate the script.

The goal is not longer prompting. The goal is choosing the right kind of exam before writing the answer.

## Performance Engine Rule

觀眾需要知道，不等於角色會這樣說。

Before formal blocks, build dramaticSetup and performance rehearsal:
- Who is speaking?
- What do they want on the surface?
- What are they secretly afraid of?
- What are they protecting?
- How do they defend their face or status?
- Why must this be said now?

Every line or voiceover must trace back to character fear, desire, defense, status concern, lived experience, or relationship tension.
If a line exists only because the audience needs information, rewrite it as behavior, silence, pushback, subtext, attitude, or point of view.

Fail any script that collapses into:

```text
question -> answer -> follow-up -> answer -> CTA
```

Do not make one character a question tool or the other an answer machine.
The scene should feel like people living inside the moment, not a customer-service flow.

## Narrative Modes

- 誤解反轉
- 情境切片
- 荒謬日常
- 案例重演
- 一句話刺痛
- 教學拆解
- 街訪感
- 紀錄片旁白
- 老闆內心戲
- 產品使用瞬間
- 客人真實疑問
- 前後對比

## Mode Structures

### 誤解反轉
- 誤解出現
- 現場證據
- 反轉原因
- 正確觀念
- 低壓 CTA

### 情境切片
- 日常動作
- 突然卡住
- 一句內心話
- 小小解法
- 生活感收尾

### 荒謬日常
- 正常開場
- 荒謬插入
- 主角反應
- 現實吐槽
- 品牌/專業落點

### 案例重演
- 事件前狀態
- 具體觸發
- 當事人反應
- 專業介入
- 可帶走的提醒

### 一句話刺痛
- 一句刺痛
- 為什麼會中
- 觀眾常見逃避
- 一個具體改法
- 低壓下一步

### 教學拆解
- 一句問題
- 拆第一層
- 舉例
- 避免踩雷
- 下一步

### 街訪感
- 路人直覺回答
- 追問
- 意外答案
- 專業補充
- 觀眾互動

### 紀錄片旁白
- 環境聲/畫面
- 人物動作
- 細節觀察
- 觀點浮出
- 安靜收尾

### 老闆內心戲
- 表面客氣
- 內心 OS
- 現場細節
- 真正痛點
- 收斂成觀點

### 產品使用瞬間
- 拿起/看到產品
- 第一個使用動作
- 小阻力或小驚喜
- 使用後狀態
- 自然引導

### 客人真實疑問
- 客人原話
- 背後焦慮
- 專業拆解
- 具體判斷方式
- 邀請補資料

### 前後對比
- Before 狀態
- 轉變觸發
- 過程片段
- After 狀態
- 不誇大的結論

## Conversation Rule

Multi-person scripts do not need to become debate scripts.
If scriptStyle includes more than one person, each block should contain a clear conversational function, such as interruption, reaction, question, misunderstanding, emotional response, observation, silence, decision, or small physical action.
Do not force every block into objection/response.

## Shooting Types

- talkingHead
- followCam
- dialogue
- streetInterview
- shortDrama
- documentary
- productMoment
- montage
- dailySlice

## Sound Designs

- voiceover
- naturalSound
- dialogue
- subtitleOnly
- silent
- innerMonologue

## Block Generation Rule

Do not force every block to have a speaker or dialogue.

If shootingType is documentary, dailySlice, productMoment, montage, or followCam:
- visual and action are mandatory.
- speaker and line are optional and can be null.
- prefer camera movement, object detail, natural sound, subtitle, pause, and voiceover.
- do not create hidden-interviewer Q&A unless the selected scriptStyle explicitly requires it.
- avoid alternating between 藏鏡人 and 品牌主.
- the scene should move through image and action first, not through questions and answers.

If shootingType is dialogue, streetInterview, hiddenInterviewer, or shortDrama:
- speaker and line can be used.
- still avoid repetitive 問答 → 回答 → 追問 → CTA structure.
- each line must push emotion, action, conflict, or information.

## Rehearsal Types

- dailyScene
- interview
- innerMonologue
- customerCase
- teachingDemo
- documentaryMoment
- productMoment

Choose the rehearsal type from the narrativeMode. A coffee shop can be a morning opening scene. An accountant can be a midnight invoice message. A coach can be a body-check moment. Do not default to "you thought A, actually B".
