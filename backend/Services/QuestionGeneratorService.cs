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
You are generating 3 English grammar practice questions for ESOL learners.

ERROR TYPE:
- {request.ErrorType}

USER PROFILE:
- First Language: {request.FirstLanguage}
- Age: {request.Age}
- CEFR Level: {request.Level}

CEFR DIFFICULTY RULES (IMPORTANT):
- A1: Use very simple vocabulary, everyday topics, and short present-tense sentences.
- A2: Use simple past/present, basic connectors, familiar topics, and short clear structures.
- B1: Use moderately complex sentences, everyday + practical topics, and some detail.
- B2: Use more complex grammar, abstract or academic-leaning topics, and multi-clause sentences.
- C1: Use advanced structures, nuance, less common vocabulary, and concise but sophisticated phrasing.
- C2: Use near-native complexity, highly varied vocabulary, implied meaning, and flexible grammar use.

TASK:
Generate EXACTLY THREE fill-in-the-blank questions.

Each question:
- 1–2 sentences
- Contains 1–3 blanks written as ___
- Targets: {request.ErrorType}
- Uses a DIFFERENT topic for each question

ANSWERS:
- Answer array per question
- EXACTLY one answer per blank
- CHECK that the count matches before responding

STRICT OUTPUT FORMAT (NO EXTRA TEXT):

Question 1:
<question>

Answer 1:
[""answer1"", ""answer2""]

Question 2:
<question>

Answer 2:
[""answer""]

Question 3:
<question>

Answer 3:
[""answer""]

You MUST NOT:
- Add markdown
- Add explanations
- Use any other structure

Before responding:
- Validate there are EXACTLY 3 questions with answers

RANDOM_SEED: {Guid.NewGuid()}
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
