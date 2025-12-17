using System.Text.RegularExpressions;
using backend.Models.DTOs;
using backend.Services.Interfaces;

namespace backend.Services
{
    public class QuestionGeneratorService : IQuestionGeneratorService
    {
        private readonly IGeminiClient _geminiClient;

        public QuestionGeneratorService(IGeminiClient geminiClient)
        {
            _geminiClient = geminiClient;
        }

        public async Task<PracticeQuestionResponse> GenerateAsync(QuestionGenerationRequest request)
        {
            var prompt = BuildPrompt(request);

            var result = await _geminiClient.GenerateTextAsync(prompt);
            var parsed = ParseGeminiResponse(result.Output);

            Console.WriteLine($"[QuestionGenerator] Model used: {result.ModelUsed}");
            Console.WriteLine($"[QuestionGenerator] Parsed questions count: {parsed.Count}");

            int attempts = 0;
            while (parsed.Count < 3 && attempts < 3)
            {
                Console.WriteLine($"[QuestionGenerator] Missing questions — regenerating attempt {attempts + 1}...");
                var retry = await _geminiClient.GenerateTextAsync(prompt);
                parsed = ParseGeminiResponse(retry.Output);
                result = retry;
                attempts++;
            }

            return new PracticeQuestionResponse
            {
                Questions = parsed,
                ModelUsed = result.ModelUsed
            };
        }

        private string BuildPrompt(QuestionGenerationRequest request)
        {
            return $@"
You are an English teacher creating grammar practice questions for ESOL learners.

GOAL:
Create EXACTLY 3 fill-in-the-blank questions that practice this error type:
{request.ErrorType}

LEARNER PROFILE:
- First language: {request.FirstLanguage}
- Age: {request.Age}
- English level (CEFR): {request.Level}

DIFFICULTY:
Adjust vocabulary, sentence length, and grammar complexity to match the CEFR level.
Use age-appropriate and culturally neutral topics.

QUESTION RULES:
- Write exactly 3 questions
- Each question is 1–2 sentences
- Each question contains 1–3 blanks written as ___
- Each question must clearly test the error type
- Each question must sound natural when completed
- All questions must be different

ANSWER RULES:
- Provide ONLY the grammatically correct word(s)
- Answers must be fully inflected (correct tense, number, and agreement)
- Do NOT use base verb forms unless they are correct in context
- One word per blank
- No alternatives or explanations
- Number of answers must exactly match number of blanks

STRICT OUTPUT FORMAT (NO EXTRA TEXT):

Question 1:
<question>

Answer 1:
[""answer"", ""answer""]

Question 2:
<question>

Answer 2:
[""answer""]

Question 3:
<question>

Answer 3:
[""answer""]

IMPORTANT GRAMMAR RULE:
- Answers MUST be fully grammatically correct in the sentence
- Do NOT use base verb forms unless the base form is correct in context
- For past events, use past tense verbs
- For third person singular, include correct verb endings

FINAL SELF-CHECK (MANDATORY):
For each question:
- Insert the answer into the blank
- Read the full sentence
- If the sentence is not fully grammatical, FIX the answer
- Do NOT output base verb forms for past or third-person contexts
";
        }

        private List<PracticeQuestion> ParseGeminiResponse(string raw)
        {
            var questions = new List<PracticeQuestion>();

            var questionMatches = Regex.Matches(
                raw,
                @"Question\s*(\d+)\s*:\s*(.*?)\s*Answer\s*\1\s*:",
                RegexOptions.Multiline);

            var answerMatches = Regex.Matches(
                raw,
                @"Answer\s*(\d+)\s*:\s*\[(.+?)\]",
                RegexOptions.Multiline);

            int count = Math.Min(3, Math.Min(questionMatches.Count, answerMatches.Count));

            for (int i = 0; i < count; i++)
            {
                var questionText = questionMatches[i].Groups[2].Value.Trim();
                var answersRaw = answerMatches[i].Groups[2].Value;

                var answers = answersRaw
                    .Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .Select(a => a.Replace("\"", "").Trim())
                    .ToList();

                int blankCount = questionText.Split("___").Length - 1;

                if (blankCount == 0) continue;
                if (answers.Count != blankCount) continue;

                questions.Add(new PracticeQuestion
                {
                    QuestionText = questionText,
                    Answers = answers
                });
            }

            return questions;
        }
    }
}
